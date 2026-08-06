import type { AnswerOutcome } from '../answerOutcome'
import type { ConfidenceLevel } from '../exercise'

export const CURRENT_LEVEL_WEIGHT_FACTOR = 2
export const RETRY_DISTINCT_CARD_GAP = 5
export const RETRY_MIN_WEIGHT = 10

export interface SessionAnswerForSelection {
  exerciseId: string
  outcome: AnswerOutcome
  confidence?: ConfidenceLevel
}

export interface SessionCardSelectionState {
  lastOutcome: AnswerOutcome | null
  lastConfidence: ConfidenceLevel | null
  distinctCardsSinceLastAnswer: number
}

export interface TrainingExerciseWeightInput {
  spacedRepetitionWeight: number
  isCurrentLevel: boolean
  sessionState: SessionCardSelectionState
}

export function getSessionCardSelectionState(
  exerciseId: string,
  answers: SessionAnswerForSelection[],
): SessionCardSelectionState {
  let lastAnswerIndex = -1
  for (let index = answers.length - 1; index >= 0; index--) {
    if (answers[index].exerciseId === exerciseId) {
      lastAnswerIndex = index
      break
    }
  }
  if (lastAnswerIndex < 0) {
    return { lastOutcome: null, lastConfidence: null, distinctCardsSinceLastAnswer: 0 }
  }

  const lastAnswer = answers[lastAnswerIndex]
  const laterExerciseIds = answers
    .slice(lastAnswerIndex + 1)
    .filter(answer => answer.exerciseId !== exerciseId)
    .map(answer => answer.exerciseId)

  return {
    lastOutcome: lastAnswer.outcome,
    lastConfidence: lastAnswer.confidence ?? null,
    distinctCardsSinceLastAnswer: new Set(laterExerciseIds).size,
  }
}

function requiredRequeueGap(
  outcome: AnswerOutcome,
  confidence: ConfidenceLevel | null,
): number {
  if (outcome === 'correct' && confidence === 'medium') return 8
  if (outcome !== 'correct' && confidence === 'high') return 6
  if (outcome !== 'correct' && confidence === 'none') return 4
  return RETRY_DISTINCT_CARD_GAP
}

export function getTrainingExerciseWeight({
  spacedRepetitionWeight,
  isCurrentLevel,
  sessionState,
}: TrainingExerciseWeightInput): number {
  if (
    sessionState.lastOutcome === 'correct'
    && sessionState.lastConfidence !== 'medium'
  ) {
    return 0
  }

  if (sessionState.lastOutcome !== null) {
    const minGap = requiredRequeueGap(
      sessionState.lastOutcome,
      sessionState.lastConfidence,
    )
    if (sessionState.distinctCardsSinceLastAnswer < minGap) return 0
  }

  const retryWeight = sessionState.lastOutcome === null
    ? spacedRepetitionWeight
    : Math.max(spacedRepetitionWeight, RETRY_MIN_WEIGHT)
  const levelFactor = isCurrentLevel ? CURRENT_LEVEL_WEIGHT_FACTOR : 1
  return retryWeight * levelFactor
}

export function pickWeightedIndex(
  weights: number[],
  random = Math.random,
): number {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  if (totalWeight <= 0) return -1

  let roll = random() * totalWeight
  for (let index = 0; index < weights.length; index++) {
    roll -= weights[index]
    if (roll <= 0 && weights[index] > 0) return index
  }

  for (let index = weights.length - 1; index >= 0; index--) {
    if (weights[index] > 0) return index
  }
  return -1
}
