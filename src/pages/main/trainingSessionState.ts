import { db, type StoredTrainingSession } from '../../db/db'
import type { AnswerResult } from '../../entities/exercise/exercise'
import type { ExerciseSetKey } from '../../entities/exercise/services/exerciseLoadingService'

export interface TrainingSessionState {
  exerciseId: string
  phase: 'answering' | 'submitted'
  lastResult: AnswerResult | null
  totalAnswered: number
  totalCorrect: number
  totalTimeMs: number
  questionStartedAt: number
}

let pendingSave = Promise.resolve()

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isAnswerResult(value: unknown): value is AnswerResult {
  if (!value || typeof value !== 'object') return false

  const result = value as Record<string, unknown>
  if (typeof result.isCorrect !== 'boolean') return false
  if (
    result.scorePermille !== undefined
    && (
      typeof result.scorePermille !== 'number'
      || !Number.isFinite(result.scorePermille)
      || result.scorePermille < 0
      || result.scorePermille > 1000
    )
  ) return false
  if (
    result.outcome !== undefined
    && result.outcome !== 'correct'
    && result.outcome !== 'partial'
    && result.outcome !== 'incorrect'
  ) return false
  if (result.isCloseMatch !== undefined && typeof result.isCloseMatch !== 'boolean') return false
  if (result.submittedValue !== undefined && typeof result.submittedValue !== 'string') return false
  if (
    result.selectedIndices !== undefined
    && (
      !Array.isArray(result.selectedIndices)
      || !result.selectedIndices.every(index => Number.isInteger(index))
    )
  ) return false

  return true
}

function toTrainingSessionState(
  stored: StoredTrainingSession | undefined,
): TrainingSessionState | null {
  if (!stored) return null
  if (!stored.exerciseId) return null
  if (stored.phase !== 'answering' && stored.phase !== 'submitted') return null
  if (!isFiniteNumber(stored.totalAnswered) || stored.totalAnswered < 0) return null
  if (!isFiniteNumber(stored.totalCorrect) || stored.totalCorrect < 0) return null
  if (!isFiniteNumber(stored.totalTimeMs) || stored.totalTimeMs < 0) return null
  if (!isFiniteNumber(stored.questionStartedAt)) return null
  if (stored.phase === 'submitted' && !isAnswerResult(stored.lastResult)) return null

  const lastResult = isAnswerResult(stored.lastResult) ? stored.lastResult : null
  return {
    exerciseId: stored.exerciseId,
    phase: stored.phase,
    lastResult: stored.phase === 'submitted' ? lastResult : null,
    totalAnswered: stored.totalAnswered,
    totalCorrect: stored.totalCorrect,
    totalTimeMs: stored.totalTimeMs,
    questionStartedAt: stored.questionStartedAt,
  }
}

export async function loadTrainingSessionState(
  source: ExerciseSetKey,
): Promise<TrainingSessionState | null> {
  await pendingSave
  try {
    return toTrainingSessionState(await db.trainingSessions.get(source))
  } catch {
    return null
  }
}

export function saveTrainingSessionState(
  source: ExerciseSetKey,
  state: TrainingSessionState,
): Promise<void> {
  pendingSave = pendingSave.then(async () => {
    try {
      await db.trainingSessions.put({ source, ...state })
    } catch {
      // Keep the active training session in memory if persistence is unavailable.
    }
  })
  return pendingSave
}

export function clearTrainingSessionState(
  source: ExerciseSetKey,
): Promise<void> {
  pendingSave = pendingSave.then(async () => {
    try {
      await db.trainingSessions.delete(source)
    } catch {
      // Keep the exhausted state in memory if persistence is unavailable.
    }
  })
  return pendingSave
}
