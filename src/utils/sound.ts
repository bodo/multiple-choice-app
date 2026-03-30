/**
 * Generate and play simple sound effects using Web Audio API
 * No external audio files needed
 */

let audioContext: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return audioContext
}

/**
 * Play a success/correct answer sound (ascending bell-like ding)
 */
export function playCorrectSound(): void {
  const ctx = getAudioContext()
  const now = ctx.currentTime
  const volume = ctx.createGain()
  volume.connect(ctx.destination)
  volume.gain.setValueAtTime(0.3, now) // 30% volume for accessibility
  volume.gain.exponentialRampToValueAtTime(0.01, now + 0.5)

  // Create a pleasant ascending tone
  const freq1 = ctx.createOscillator()
  freq1.type = 'sine'
  freq1.frequency.setValueAtTime(523.25, now) // C5
  freq1.frequency.linearRampToValueAtTime(659.25, now + 0.1) // E5
  freq1.connect(volume)
  freq1.start(now)
  freq1.stop(now + 0.2)

  const freq2 = ctx.createOscillator()
  freq2.type = 'sine'
  freq2.frequency.setValueAtTime(659.25, now + 0.15) // E5
  freq2.frequency.linearRampToValueAtTime(783.99, now + 0.25) // G5
  freq2.connect(volume)
  freq2.start(now + 0.15)
  freq2.stop(now + 0.35)

  const freq3 = ctx.createOscillator()
  freq3.type = 'sine'
  freq3.frequency.setValueAtTime(783.99, now + 0.3) // G5
  freq3.frequency.linearRampToValueAtTime(1046.5, now + 0.4) // C6
  freq3.connect(volume)
  freq3.start(now + 0.3)
  freq3.stop(now + 0.5)
}

/**
 * Play an error/incorrect answer sound (descending buzz)
 */
export function playIncorrectSound(): void {
  const ctx = getAudioContext()
  const now = ctx.currentTime
  const volume = ctx.createGain()
  volume.connect(ctx.destination)
  volume.gain.setValueAtTime(0.2, now) // 20% volume for accessibility
  volume.gain.exponentialRampToValueAtTime(0.01, now + 0.4)

  // Create a descending buzz tone
  const freq1 = ctx.createOscillator()
  freq1.type = 'sawtooth'
  freq1.frequency.setValueAtTime(349.23, now) // F4
  freq1.frequency.linearRampToValueAtTime(261.63, now + 0.2) // C4
  freq1.connect(volume)
  freq1.start(now)
  freq1.stop(now + 0.2)

  const freq2 = ctx.createOscillator()
  freq2.type = 'sawtooth'
  freq2.frequency.setValueAtTime(261.63, now + 0.15) // C4
  freq2.frequency.linearRampToValueAtTime(196, now + 0.35) // G3
  freq2.connect(volume)
  freq2.start(now + 0.15)
  freq2.stop(now + 0.35)
}
