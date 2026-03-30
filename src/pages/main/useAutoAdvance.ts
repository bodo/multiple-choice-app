export const ADVANCE_DELAY_CORRECT = 1500
export const ADVANCE_DELAY_INCORRECT = 3000

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

export function useAutoAdvance() {
  return { schedule, cancel }
}
