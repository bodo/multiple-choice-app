import { ref, computed, watch } from 'vue'
import type { AnswerResult } from '../../entities/exercise/exercise'
import type { LearningLevel } from '../../entities/exercise/learningLevel'
import { useSettings } from '../../entities/settings/useSettings'
import { useAutoAdvance } from './useAutoAdvance'
import { playCorrectSound, playIncorrectSound } from '../../utils/sound'
import { vibrateCorrect, vibrateIncorrect } from '../../utils/haptics'
import {
  flagPendingAutomaticWeakspots,
  getDueWeight,
  getTrainingSessionCardSelectionState,
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
  getTrainingExerciseWeight,
  pickWeightedIndex,
} from '../../entities/exercise/services/trainingExerciseSelectionService'
import {
  clearTrainingSessionState,
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
const sessionMilestone = ref<3 | 20 | 50 | null>(null)
const trainingSelectionExhausted = ref(false)

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
let questionActiveDurationMs = 0
let questionVisibleSince = document.visibilityState === 'visible' ? Date.now() : null
let milestoneTimer: number | undefined

function resetQuestionTiming() {
  questionStartTime.value = Date.now()
  questionActiveDurationMs = 0
  questionVisibleSince = document.visibilityState === 'visible' ? Date.now() : null
}

function activeQuestionDurationMs(): number {
  if (questionVisibleSince !== null) {
    questionActiveDurationMs += Date.now() - questionVisibleSince
    questionVisibleSince = Date.now()
  }
  return questionActiveDurationMs
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden' && questionVisibleSince !== null) {
    questionActiveDurationMs += Date.now() - questionVisibleSince
    questionVisibleSince = null
  } else if (document.visibilityState === 'visible' && phase.value === 'answering') {
    questionVisibleSince = Date.now()
  }
}

document.addEventListener('visibilitychange', handleVisibilityChange)

function showSessionMilestone(milestone: 3 | 20 | 50 | null) {
  if (milestone === null) return
  sessionMilestone.value = milestone
  if (milestoneTimer !== undefined) window.clearTimeout(milestoneTimer)
  milestoneTimer = window.setTimeout(() => {
    sessionMilestone.value = null
  }, 5000)
}

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

  let candidates: number[]
  let weights: number[]
  if (mode.value === 'exam') {
    candidates = eligibleIndices.filter(index =>
      !examSeenExerciseIds.has(list[index].id))
    if (candidates.length === 0) return -1
    weights = candidates.map(index => getWeight(list[index].id))
  } else {
    candidates = eligibleIndices.filter(index => index !== currentIndex.value)
    weights = candidates.map(index => getTrainingExerciseWeight({
      spacedRepetitionWeight: getDueWeight(list[index].id),
      isCurrentLevel: list[index].learningLevel === learningLevel.value,
      sessionState: getTrainingSessionCardSelectionState(list[index].id),
    }))
  }

  const selectedCandidateIndex = pickWeightedIndex(weights)
  return selectedCandidateIndex < 0 ? -1 : candidates[selectedCandidateIndex]
}

function setCurrentIndex(index: number) {
  currentExerciseId.value = exercises.value[index]?.id ?? null
}

function selectNextExercise() {
  const nextIndex = pickNextIndex()
  setCurrentIndex(nextIndex)
  trainingSelectionExhausted.value = mode.value === 'train'
    && nextIndex < 0
    && selectableIds.value.size > 0
  if (trainingSelectionExhausted.value) {
    void clearTrainingSessionState(activeExerciseSetKey.value)
  }
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
  const activeAnswerDurationMs = activeQuestionDurationMs()
  totalAnswered.value++
  if (result.isCorrect) totalCorrect.value++
  totalTimeMs.value += answerTimeMs

  if (currentExercise.value) {
    const recorded = await recordAnswer(
      currentExercise.value,
      result,
      answerTimeMs,
      activeAnswerDurationMs,
      mode.value,
    )
    showSessionMilestone(recorded.milestone)
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
    if (result.outcome === 'correct' || (result.outcome === undefined && result.isCorrect)) {
      playCorrectSound()
    } else if (result.outcome !== 'partial') {
      playIncorrectSound()
    }
  }
  if (hapticEnabled.value) {
    if (result.outcome === 'correct' || (result.outcome === undefined && result.isCorrect)) {
      vibrateCorrect()
    } else if (result.outcome !== 'partial') {
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

  selectNextExercise()
  lastResult.value = null
  phase.value = 'answering'
  resetQuestionTiming()
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
  selectNextExercise()
  lastResult.value = null
  phase.value = 'answering'
  resetQuestionTiming()
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
    trainingSelectionExhausted.value = false
    setCurrentIndex(storedExerciseIndex)
    lastResult.value = stored.lastResult
    questionStartTime.value = stored.questionStartedAt
    questionActiveDurationMs = 0
    questionVisibleSince = document.visibilityState === 'visible' ? Date.now() : null
    phase.value = stored.phase
    if (stored.lastResult) scheduleAutoAdvance(stored.lastResult)
    return
  }

  selectNextExercise()
  lastResult.value = null
  resetQuestionTiming()
  phase.value = 'answering'
  persistTrainingSession()
}

// Initialize on first exercise load
watch(exercises, (list) => {
  if (list.length === 0) {
    initializationVersion++
    currentExerciseId.value = null
    trainingSelectionExhausted.value = false
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
  trainingSelectionExhausted.value = false
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
    trainingSelectionExhausted.value = false
    lastResult.value = null
    phase.value = 'answering'
  } else {
    selectNextExercise()
    lastResult.value = null
    phase.value = 'answering'
    resetQuestionTiming()
    persistTrainingSession()
  }
})

watch(mode, (newMode) => {
  initializationVersion++
  cancel()
  if (exercises.value.length === 0) {
    currentExerciseId.value = null
    trainingSelectionExhausted.value = false
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
    sessionMilestone,
    trainingSelectionExhausted,
  }
}
