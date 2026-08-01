import { ref, computed, watch } from 'vue'
import type { AnswerResult } from '../../entities/exercise/exercise'
import type { LearningLevel } from '../../entities/exercise/learningLevel'
import { useSettings } from '../../entities/settings/useSettings'
import { useAutoAdvance } from './useAutoAdvance'
import { playCorrectSound, playIncorrectSound } from '../../utils/sound'
import { vibrateCorrect, vibrateIncorrect } from '../../utils/haptics'
import {
  flagPendingAutomaticWeakspots,
  getWeight,
  isExerciseWeakspot,
  recordAnswer,
} from '../../entities/exercise/useExerciseHistory'
import { useExerciseCatalog } from '../../entities/exercise/useExerciseCatalog'
import { useExercises } from '../../entities/exercise/useExercises'
import { assessLearningLevel } from '../../entities/exercise/services/learningLevelService'
import {
  isInExamScope,
  isWithinLearningLevel,
} from '../../entities/exercise/services/exerciseScopeService'
import {
  loadTrainingSessionState,
  saveTrainingSessionState,
  type TrainingSessionState,
} from './trainingSessionState'

export type FlowPhase = 'loading' | 'answering' | 'submitted' | 'finished'

// Module-level singletons — persist across route changes
const phase = ref<FlowPhase>('loading')
const currentExerciseId = ref<string | null>(null)
const lastResult = ref<AnswerResult | null>(null)

// Session stats (reset per exam, running in train)
const totalAnswered = ref(0)
const totalCorrect = ref(0)
const questionStartTime = ref(Date.now())
const totalTimeMs = ref(0)

// Exam state
const examQuestionsRemaining = ref(0)
const examQuestionTotal = ref(0)
const newWeakspotExerciseId = ref<string | null>(null)
const examNewWeakspotCount = ref(0)
const newLearningLevel = ref<LearningLevel | null>(null)
const examSeenExerciseIds = new Set<string>()

const { exercises, activeExerciseSetKey } = useExercises()
const { schedule, cancel } = useAutoAdvance()
const {
  autoAdvance,
  timeoutCorrect,
  timeoutIncorrect,
  soundEnabled,
  hapticEnabled,
  mode,
  examQuestionCount,
  mobileSolvableOnly,
  specialization,
  learningLevel,
  automaticLevelProgression,
} = useSettings()
const { categoryFilteredIds } = useExerciseCatalog()

let initializationVersion = 0

const currentIndex = computed(() =>
  exercises.value.findIndex(exercise => exercise.id === currentExerciseId.value),
)
const currentExercise = computed(() =>
  exercises.value.find(exercise => exercise.id === currentExerciseId.value) ?? null,
)
const selectableIds = computed(() => {
  const filteredIds = categoryFilteredIds.value
  return new Set(
    exercises.value
      .filter(exercise =>
        (mode.value === 'exam' || filteredIds.has(exercise.id))
        && (!mobileSolvableOnly.value || exercise.mobileSolvable !== false)
        && exercise.specializations.includes(specialization.value)
        && isWithinLearningLevel(exercise, learningLevel.value)
        && (mode.value !== 'exam' || isInExamScope(exercise, learningLevel.value))
        && (mode.value === 'exam' || !isExerciseWeakspot(exercise.id)),
      )
      .map(exercise => exercise.id),
  )
})
const totalExercises = computed(() => exercises.value.length)
const accuracy = computed(() => totalAnswered.value === 0 ? 0 : Math.round((totalCorrect.value / totalAnswered.value) * 100))
const averageTimeSeconds = computed(() => totalAnswered.value === 0 ? 0 : totalTimeMs.value / totalAnswered.value / 1000)
const isExamActive = computed(() => mode.value === 'exam' && phase.value !== 'finished')
const isExamFinished = computed(() => mode.value === 'exam' && phase.value === 'finished')
const examTotal = computed(() => examQuestionTotal.value)

/** Pick a random exercise index weighted by spaced repetition and active filters. */
function pickNextIndex(): number {
  const list = exercises.value
  const eligibleIndices = list
    .map((exercise, index) => ({ exercise, index }))
    .filter(({ exercise }) => selectableIds.value.has(exercise.id))
    .map(({ index }) => index)
  if (eligibleIndices.length === 0) return -1

  const alternatives = eligibleIndices.filter(index => index !== currentIndex.value)
  let candidates = alternatives.length > 0 ? alternatives : eligibleIndices
  if (mode.value === 'exam') {
    candidates = candidates.filter(index =>
      !examSeenExerciseIds.has(list[index].id))
    if (candidates.length === 0) return -1
  } else {
    const currentLevelCandidates = candidates.filter(index =>
      list[index].learningLevel === learningLevel.value)
    const prerequisiteCandidates = candidates.filter(index =>
      list[index].learningLevel < learningLevel.value)
    if (currentLevelCandidates.length > 0 && prerequisiteCandidates.length > 0) {
      candidates = Math.random() < 0.6
        ? currentLevelCandidates
        : prerequisiteCandidates
    }
  }
  const weights = candidates.map(index => getWeight(list[index].id))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  if (totalWeight === 0) return candidates[0]

  let roll = Math.random() * totalWeight
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return candidates[i]
  }
  return candidates[0]
}

function setCurrentIndex(index: number) {
  currentExerciseId.value = exercises.value[index]?.id ?? null
}

function getTrainingSessionState(): TrainingSessionState | null {
  const exercise = currentExercise.value
  if (
    mode.value !== 'train'
    || !exercise
    || (phase.value !== 'answering' && phase.value !== 'submitted')
  ) return null

  return {
    exerciseId: exercise.id,
    phase: phase.value,
    lastResult: lastResult.value,
    totalAnswered: totalAnswered.value,
    totalCorrect: totalCorrect.value,
    totalTimeMs: totalTimeMs.value,
    questionStartedAt: questionStartTime.value,
  }
}

function persistTrainingSession() {
  const state = getTrainingSessionState()
  if (state) {
    void saveTrainingSessionState(activeExerciseSetKey.value, state)
  }
}

function scheduleAutoAdvance(result: AnswerResult) {
  if (!autoAdvance.value || mode.value !== 'train') return

  const delay = result.isCorrect ? timeoutCorrect.value : timeoutIncorrect.value
  schedule(delay, advance)
}

async function submitAnswer(result: AnswerResult) {
  lastResult.value = result
  phase.value = 'submitted'

  // Timer stops here — time between question shown and answer submitted
  const answerTimeMs = Date.now() - questionStartTime.value
  totalAnswered.value++
  if (result.isCorrect) totalCorrect.value++
  totalTimeMs.value += answerTimeMs

  if (currentExercise.value) {
    const recorded = await recordAnswer(
      currentExercise.value,
      result.isCorrect,
      answerTimeMs,
      mode.value,
    )
    if (recorded.becameWeakspot) {
      newWeakspotExerciseId.value = currentExercise.value.id
    }
    if (mode.value === 'exam') {
      examSeenExerciseIds.add(currentExercise.value.id)
    }
    if (mode.value === 'train' && automaticLevelProgression.value) {
      const assessment = assessLearningLevel(exercises.value, learningLevel.value)
      if (assessment.recommendedLevel > learningLevel.value) {
        learningLevel.value = assessment.recommendedLevel
        newLearningLevel.value = assessment.recommendedLevel
      }
    }
  }
  if (soundEnabled.value) {
    if (result.isCorrect) {
      playCorrectSound()
    } else {
      playIncorrectSound()
    }
  }
  if (hapticEnabled.value) {
    if (result.isCorrect) {
      vibrateCorrect()
    } else {
      vibrateIncorrect()
    }
  }

  // In exam mode, decrement remaining
  if (mode.value === 'exam') {
    examQuestionsRemaining.value--
  }

  persistTrainingSession()
  if (!newWeakspotExerciseId.value && !newLearningLevel.value) {
    scheduleAutoAdvance(result)
  }
}

function advance() {
  cancel()
  newWeakspotExerciseId.value = null
  newLearningLevel.value = null
  if (exercises.value.length === 0) return

  // In exam mode, check if exam is done
  if (mode.value === 'exam' && examQuestionsRemaining.value <= 0) {
    phase.value = 'finished'
    void flagPendingAutomaticWeakspots().then((count) => {
      examNewWeakspotCount.value = count
    })
    return
  }

  setCurrentIndex(pickNextIndex())
  lastResult.value = null
  phase.value = 'answering'
  questionStartTime.value = Date.now()
  persistTrainingSession()
}

/** Start or restart an exam */
function startExam() {
  totalAnswered.value = 0
  totalCorrect.value = 0
  totalTimeMs.value = 0
  examSeenExerciseIds.clear()
  examQuestionTotal.value = Math.min(examQuestionCount.value, selectableIds.value.size)
  examQuestionsRemaining.value = examQuestionTotal.value
  examNewWeakspotCount.value = 0
  newWeakspotExerciseId.value = null
  setCurrentIndex(pickNextIndex())
  lastResult.value = null
  phase.value = 'answering'
  questionStartTime.value = Date.now()
}

function restoreTrainingStats(state: TrainingSessionState | null) {
  totalAnswered.value = state?.totalAnswered ?? 0
  totalCorrect.value = state?.totalCorrect ?? 0
  totalTimeMs.value = state?.totalTimeMs ?? 0
}

async function initializeTraining(list: typeof exercises.value) {
  const source = activeExerciseSetKey.value
  const requestVersion = ++initializationVersion
  cancel()
  phase.value = 'loading'

  const stored = await loadTrainingSessionState(source)
  if (
    requestVersion !== initializationVersion
    || mode.value !== 'train'
    || activeExerciseSetKey.value !== source
    || exercises.value !== list
  ) return

  restoreTrainingStats(stored)
  const storedExerciseIndex = stored
    ? list.findIndex(exercise =>
        exercise.id === stored.exerciseId && selectableIds.value.has(exercise.id))
    : -1

  if (stored && storedExerciseIndex >= 0) {
    setCurrentIndex(storedExerciseIndex)
    lastResult.value = stored.lastResult
    questionStartTime.value = stored.questionStartedAt
    phase.value = stored.phase
    if (stored.lastResult) scheduleAutoAdvance(stored.lastResult)
    return
  }

  setCurrentIndex(pickNextIndex())
  lastResult.value = null
  questionStartTime.value = Date.now()
  phase.value = 'answering'
  persistTrainingSession()
}

// Initialize on first exercise load
watch(exercises, (list) => {
  if (list.length === 0) {
    initializationVersion++
    currentExerciseId.value = null
    phase.value = 'loading'
    return
  }

  if (
    phase.value !== 'loading'
    && currentExercise.value
    && selectableIds.value.has(currentExercise.value.id)
  ) return

  if (mode.value === 'exam') {
    startExam()
  } else {
    void initializeTraining(list)
  }
}, { immediate: true })

watch(activeExerciseSetKey, () => {
  initializationVersion++
  cancel()
  currentExerciseId.value = null
  lastResult.value = null
  phase.value = 'loading'
})

// When a selection filter changes, keep the current exercise inside the pool.
watch(selectableIds, (ids) => {
  const ex = currentExercise.value
  if (
    phase.value === 'loading'
    || phase.value === 'finished'
    || phase.value === 'submitted'
    || (ex && ids.has(ex.id))
  ) return

  cancel()
  if (ids.size === 0) {
    currentExerciseId.value = null
    lastResult.value = null
    phase.value = 'answering'
  } else {
    setCurrentIndex(pickNextIndex())
    lastResult.value = null
    phase.value = 'answering'
    questionStartTime.value = Date.now()
    persistTrainingSession()
  }
})

watch(mode, (newMode) => {
  initializationVersion++
  cancel()
  if (exercises.value.length === 0) {
    currentExerciseId.value = null
    lastResult.value = null
    phase.value = 'loading'
  } else if (newMode === 'exam') {
    startExam()
  } else {
    currentExerciseId.value = null
    lastResult.value = null
    void initializeTraining(exercises.value)
  }
})

watch(learningLevel, () => {
  if (mode.value === 'exam' && exercises.value.length > 0) startExam()
})

export function useExerciseFlow() {
  return {
    phase, currentExercise, currentIndex, totalExercises, lastResult,
    submitAnswer, advance, startExam,
    totalAnswered, totalCorrect, accuracy, averageTimeSeconds,
    isExamActive, isExamFinished, examQuestionsRemaining, examTotal,
    newWeakspotExerciseId, examNewWeakspotCount,
    newLearningLevel,
  }
}
