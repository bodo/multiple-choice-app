import { onUnmounted } from 'vue'

export const ADVANCE_DELAY_CORRECT = 500
export const ADVANCE_DELAY_INCORRECT = 1000

export function useAutoAdvance() {
  let timer: ReturnType<typeof setTimeout> | null = null

  function schedule(delayMs: number, callback: () => void) {
    cancel()
    timer = setTimeout(callback, delayMs)
  }

  function cancel() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  onUnmounted(cancel)

  return { schedule, cancel }
}
