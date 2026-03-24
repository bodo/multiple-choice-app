import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { Exercise, AnswerResult } from '../../entities/exercise/exercise'
import { useSettings } from '../../entities/settings/useSettings'
import { useAutoAdvance, ADVANCE_DELAY_CORRECT, ADVANCE_DELAY_INCORRECT } from './useAutoAdvance'

export type FlowPhase = 'loading' | 'answering' | 'submitted' | 'advancing'

export function useExerciseFlow(exercises: Ref<Exercise[]>) {
  const phase = ref<FlowPhase>('loading')
  const currentIndex = ref(0)
  const lastResult = ref<AnswerResult | null>(null)
  const { schedule } = useAutoAdvance()
  const { autoAdvance } = useSettings()

  const currentExercise = computed(() => exercises.value[currentIndex.value] ?? null)

  function submitAnswer(result: AnswerResult) {
    lastResult.value = result
    phase.value = 'submitted'
    if (autoAdvance.value) {
      const delay = result.isCorrect ? ADVANCE_DELAY_CORRECT : ADVANCE_DELAY_INCORRECT
      schedule(delay, advance)
    }
  }

  function advance() {
    if (exercises.value.length === 0) return
    currentIndex.value = (currentIndex.value + 1) % exercises.value.length
    lastResult.value = null
    phase.value = 'answering'
  }

  watch(exercises, (list) => {
    if (list.length > 0 && phase.value === 'loading') {
      phase.value = 'answering'
    }
  })

  return { phase, currentExercise, lastResult, submitAnswer, advance }
}
