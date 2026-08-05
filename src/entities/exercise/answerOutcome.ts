export type AnswerOutcome = 'correct' | 'partial' | 'incorrect'

export const PARTIAL_ANSWER_THRESHOLD_PERMILLE = 500

export function outcomeForScore(scorePermille: number): AnswerOutcome {
  if (scorePermille >= 1000) return 'correct'
  if (scorePermille >= PARTIAL_ANSWER_THRESHOLD_PERMILLE) return 'partial'
  return 'incorrect'
}

export function normalizeScorePermille(value: number | undefined, isCorrect: boolean): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return isCorrect ? 1000 : 0
  }
  return Math.min(1000, Math.max(0, Math.round(value)))
}

export function isSuccessfulOutcome(outcome: AnswerOutcome): boolean {
  return outcome === 'correct' || outcome === 'partial'
}
