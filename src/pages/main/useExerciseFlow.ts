import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { Exercise, AnswerResult } from '../../entities/exercise/exercise'
import { useSettings } from '../../entities/settings/useSettings'
import { useAutoAdvance } from './useAutoAdvance'
import { playCorrectSound, playIncorrectSound } from '../../utils/sound'
import { vibrateCorrect, vibrateIncorrect } from '../../utils/haptics'
import { recordAnswer, getWeight } from '../../entities/exercise/useExerciseHistory'
import { useExerciseCatalog } from '../../entities/exercise/useExerciseCatalog'

export type FlowPhase = 'loading' | 'answering' | 'submitted' | 'advancing'

export function useExerciseFlow(exercises: Ref<Exercise[]>) {
  const phase = ref<FlowPhase>('loading')
  const currentIndex = ref(0)
  const lastResult = ref<AnswerResult | null>(null)
  const { schedule, cancel } = useAutoAdvance()
  const { autoAdvance, timeoutCorrect, timeoutIncorrect, soundEnabled, hapticEnabled } = useSettings()

  const { filteredIds } = useExerciseCatalog()
  const currentExercise = computed(() => exercises.value[currentIndex.value] ?? null)

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

  // Performance stats
  const totalAnswered = ref(0)
  const totalCorrect = ref(0)
  const questionStartTime = ref(Date.now())
  const totalTimeMs = ref(0)
  const accuracy = computed(() => totalAnswered.value === 0 ? 0 : Math.round((totalCorrect.value / totalAnswered.value) * 100))
  const averageTimeSeconds = computed(() => totalAnswered.value === 0 ? 0 : totalTimeMs.value / totalAnswered.value / 1000)

  function submitAnswer(result: AnswerResult) {
    lastResult.value = result
    phase.value = 'submitted'

    // Track stats
    totalAnswered.value++
    if (result.isCorrect) totalCorrect.value++
    totalTimeMs.value += Date.now() - questionStartTime.value

    // Record for spaced repetition
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
    if (autoAdvance.value) {
      const delay = result.isCorrect ? timeoutCorrect.value : timeoutIncorrect.value
      schedule(delay, advance)
    }
  }

  function advance() {
    cancel()
    if (exercises.value.length === 0) return
    currentIndex.value = pickNextIndex()
    lastResult.value = null
    phase.value = 'answering'
    questionStartTime.value = Date.now()
  }

  watch(exercises, (list) => {
    if (list.length > 0 && phase.value === 'loading') {
      currentIndex.value = pickNextIndex()
      phase.value = 'answering'
    }
  })

  const totalExercises = computed(() => exercises.value.length)

  return { phase, currentExercise, currentIndex, totalExercises, lastResult, submitAnswer, advance, totalAnswered, accuracy, averageTimeSeconds }
}
