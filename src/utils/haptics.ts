/**
 * Haptic feedback using the Vibration API.
 * Silently no-ops on devices/browsers that don't support it.
 */

function vibrate(pattern: number | number[]): void {
  if (navigator.vibrate) {
    navigator.vibrate(pattern)
  }
}

/** Short single pulse for correct answers */
export function vibrateCorrect(): void {
  vibrate(100)
}

/** Two short pulses for incorrect answers */
export function vibrateIncorrect(): void {
  vibrate([100, 50, 100])
}
