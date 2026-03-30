import { ref, computed, watch } from 'vue'
import type { AnswerResult } from '../../entities/exercise/exercise'
import { useSettings } from '../../entities/settings/useSettings'
import { useAutoAdvance } from './useAutoAdvance'
import { playCorrectSound, playIncorrectSound } from '../../utils/sound'
import { vibrateCorrect, vibrateIncorrect } from '../../utils/haptics'
import { recordAnswer, getWeight } from '../../entities/exercise/useExerciseHistory'
import { useExerciseCatalog } from '../../entities/exercise/useExerciseCatalog'
import { useExercises } from '../../entities/exercise/useExercises'

export type FlowPhase = 'loading' | 'answering' | 'submitted' | 'finished'

// Module-level singletons — persist across route changes
const phase = ref<FlowPhase>('loading')
const currentIndex = ref(0)
const lastResult = ref<AnswerResult | null>(null)

// Session stats (reset per exam, running in train)
const totalAnswered = ref(0)
const totalCorrect = ref(0)
const questionStartTime = ref(Date.now())
const totalTimeMs = ref(0)

// Exam state
const examQuestionsRemaining = ref(0)

const { exercises } = useExercises()
const { schedule, cancel } = useAutoAdvance()
const { autoAdvance, timeoutCorrect, timeoutIncorrect, soundEnabled, hapticEnabled, mode, examQuestionCount } = useSettings()
const { filteredIds } = useExerciseCatalog()

const currentExercise = computed(() => exercises.value[currentIndex.value] ?? null)
const totalExercises = computed(() => exercises.value.length)
const accuracy = computed(() => totalAnswered.value === 0 ? 0 : Math.round((totalCorrect.value / totalAnswered.value) * 100))
const averageTimeSeconds = computed(() => totalAnswered.value === 0 ? 0 : totalTimeMs.value / totalAnswered.value / 1000)
const isExamActive = computed(() => mode.value === 'exam' && phase.value !== 'finished')
const isExamFinished = computed(() => mode.value === 'exam' && phase.value === 'finished')
const examTotal = computed(() => examQuestionCount.value)

/** Pick a random exercise index weighted by spaced repetition, respecting catalog filter */
function pickNextIndex(): number {
  const list = exercises.value
  if (list.length <= 1) return 0
  const ids = filteredIds.value
  const weights = list.map((ex, i) => {
    if (i === currentIndex.value) return 0
    if (!ids.has(ex.id)) return 0
    return getWeight(ex.id)
  })
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (totalWeight === 0) return (currentIndex.value + 1) % list.length
  let roll = Math.random() * totalWeight
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return i
  }
  return 0
}

function submitAnswer(result: AnswerResult) {
  lastResult.value = result
  phase.value = 'submitted'

  // Timer stops here — time between question shown and answer submitted
  totalAnswered.value++
  if (result.isCorrect) totalCorrect.value++
  totalTimeMs.value += Date.now() - questionStartTime.value

  if (currentExercise.value) {
    recordAnswer(currentExercise.value.id, result.isCorrect)
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

  // Auto-advance only in train mode — in exam, user reviews explanation then clicks Next
  if (autoAdvance.value && mode.value === 'train') {
    const delay = result.isCorrect ? timeoutCorrect.value : timeoutIncorrect.value
    schedule(delay, advance)
  }
}

function advance() {
  cancel()
  if (exercises.value.length === 0) return

  // In exam mode, check if exam is done
  if (mode.value === 'exam' && examQuestionsRemaining.value <= 0) {
    phase.value = 'finished'
    return
  }

  currentIndex.value = pickNextIndex()
  lastResult.value = null
  phase.value = 'answering'
  questionStartTime.value = Date.now()
}

/** Start or restart an exam */
function startExam() {
  totalAnswered.value = 0
  totalCorrect.value = 0
  totalTimeMs.value = 0
  examQuestionsRemaining.value = examQuestionCount.value
  currentIndex.value = pickNextIndex()
  lastResult.value = null
  phase.value = 'answering'
  questionStartTime.value = Date.now()
}

// Initialize on first exercise load
watch(exercises, (list) => {
  if (list.length > 0 && phase.value === 'loading') {
    if (mode.value === 'exam') {
      startExam()
    } else {
      currentIndex.value = pickNextIndex()
      phase.value = 'answering'
    }
  }
}, { immediate: true })

// When tag filter changes, check if current exercise is still in the pool
watch(filteredIds, (ids) => {
  const ex = currentExercise.value
  if (ex && !ids.has(ex.id) && phase.value !== 'finished') {
    currentIndex.value = pickNextIndex()
    lastResult.value = null
    phase.value = 'answering'
    questionStartTime.value = Date.now()
  }
})

// When mode changes to exam, start a new exam
watch(mode, (newMode) => {
  if (newMode === 'exam' && exercises.value.length > 0) {
    startExam()
  }
})

export function useExerciseFlow() {
  return {
    phase, currentExercise, currentIndex, totalExercises, lastResult,
    submitAnswer, advance, startExam,
    totalAnswered, totalCorrect, accuracy, averageTimeSeconds,
    isExamActive, isExamFinished, examQuestionsRemaining, examTotal,
  }
}
