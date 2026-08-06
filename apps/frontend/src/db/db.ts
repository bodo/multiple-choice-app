import Dexie, { type EntityTable } from 'dexie'
import type { AnswerOutcome } from '../entities/exercise/answerOutcome'

export interface StoredExercise {
  key: string
  source: string
  order: number
  exercise: unknown
}

export interface StoredTrainingSession {
  source: string
  exerciseId: string
  phase: 'answering' | 'submitted'
  lastResult: unknown | null
  totalAnswered: number
  totalCorrect: number
  totalTimeMs: number
  questionStartedAt: number
}

export type LearningStatus = 'active' | 'interventionRequired'
export type WeakspotReason = 'manual' | 'repeatedIncorrect'

import type { ConfidenceLevel, ErrorSelfTag, MetacognitiveState } from '../entities/exercise/exercise'

export interface StoredAnswerLogEntry {
  date: number
  correct: boolean
  timeMs: number
  mode?: 'train' | 'exam'
  scorePermille?: number
  outcome?: AnswerOutcome
  confidence?: ConfidenceLevel
  metacognitiveState?: MetacognitiveState
  errorSelfTag?: ErrorSelfTag
  timeToRevealMs?: number
  timeToSubmitMs?: number
  timeOnExplanationMs?: number
  optionChangeCount?: number
  optionsCoveredMode?: boolean
  firstSelectedIdx?: number | null
  finalSelectedIdx?: number | null
}

export interface StoredExerciseProgress {
  exerciseId: string
  correct: number
  wrong: number
  partial?: number
  lastSeen: number
  box: number
  avgTimeMs: number
  answerLog: StoredAnswerLogEntry[]
  learningStatus: LearningStatus
  weakspotReason: WeakspotReason | null
  weakspotAt: number | null
  interventionCount: number
  lastReturnedAt: number | null
  xp: number
}

export interface StoredBookmark {
  exerciseId: string
  createdAt: number
}

export interface StoredPracticeSession {
  id: string
  date: string
  questions: number
  correct: number
  durationMs: number
  startedAt?: number
  lastActivityAt?: number
  endedAt?: number
  partial?: number
  incorrect?: number
  activeDurationMs?: number
  qualifiedAt?: number
  qualificationLocalDate?: string
  bonusSessionOrdinal?: number
  shownMilestones?: number[]
  policyVersion?: number
}

export interface StoredStreak {
  id: string
  date: string
  length: number
  correctCount?: number
  partialCount?: number
  startedAt?: number
  endedAt?: number
  sessionId?: string
  completedReason?: 'incorrect' | 'sessionTimeout' | 'profileChange'
}

export interface StoredAnswerEvent {
  id: string
  exerciseId: string
  correct: boolean
  durationMs: number
  occurredAt: number
  mode: 'train' | 'exam'
  sessionId?: string
  boxBefore?: number
  boxAfter?: number
  learningLevel?: number
  difficulty?: number
  xpEarned?: number
  dailyGoalCredit?: boolean
  activeDurationMs?: number
  scorePermille?: number
  outcome?: AnswerOutcome
  sessionAnswerIndex?: number
  masteryXpMilli?: number
  momentumXpMilli?: number
  policyVersion?: number
  confidence?: ConfidenceLevel
  metacognitiveState?: MetacognitiveState
  errorSelfTag?: ErrorSelfTag
  timeToRevealMs?: number
  timeToSubmitMs?: number
  timeOnExplanationMs?: number
  optionChangeCount?: number
  optionsCoveredMode?: boolean
  firstSelectedIdx?: number | null
  finalSelectedIdx?: number | null
}

export type XpBucket = 'mastery' | 'momentum'
export type XpReason =
  | 'answerBase'
  | 'sessionBonus'
  | 'inactivityDecay'
  | 'legacyMigration'

export interface StoredXpLedgerEntry {
  id: string
  idempotencyKey: string
  occurredAt: number
  localDate: string
  amountMilli: number
  bucket: XpBucket
  reason: XpReason
  exerciseId?: string
  answerEventId?: string
  sessionId?: string
  policyVersion: number
}

export interface StoredAppSettings {
  id: 'app'
  value: unknown
}

export interface StoredMetadata {
  key: string
  value: string | number | boolean
}

type MultipleChoiceDatabase = Dexie & {
  exercises: EntityTable<StoredExercise, 'key'>
  trainingSessions: EntityTable<StoredTrainingSession, 'source'>
  exerciseProgress: EntityTable<StoredExerciseProgress, 'exerciseId'>
  bookmarks: EntityTable<StoredBookmark, 'exerciseId'>
  practiceSessions: EntityTable<StoredPracticeSession, 'id'>
  streaks: EntityTable<StoredStreak, 'id'>
  answerEvents: EntityTable<StoredAnswerEvent, 'id'>
  xpLedger: EntityTable<StoredXpLedgerEntry, 'id'>
  settings: EntityTable<StoredAppSettings, 'id'>
  metadata: EntityTable<StoredMetadata, 'key'>
}

const allItSpecializations = ['FIAN', 'FISI', 'FIDP', 'FIDV']
const validSpecializations = new Set(allItSpecializations)
const fianAp2ExerciseId = /^fian_(?:00[1-9]|0[1-8]\d|09[0-5])$/
const legacyExerciseSources = ['json', 'api']

function exerciseSetSource(source: string, specialization: string) {
  return `${source}:${specialization}`
}

function migratedSpecializations(
  exercise: Record<string, unknown>,
  categories: string[],
) {
  const storedSpecializations = Array.isArray(exercise.specializations)
    ? exercise.specializations.filter(specialization =>
        typeof specialization === 'string'
        && validSpecializations.has(specialization))
    : []

  if (storedSpecializations.length > 0) {
    return [...new Set(storedSpecializations)]
  }

  const exerciseId = typeof exercise.id === 'string' ? exercise.id : ''
  return categories.includes('FIAN AP2') || fianAp2ExerciseId.test(exerciseId)
    ? ['FIAN']
    : [...allItSpecializations]
}

export const db = new Dexie('bodo-multiple-choice') as MultipleChoiceDatabase

db.version(1).stores({
  exercises: '&key, source, order',
})

db.version(2).stores({
  exercises: '&key, source, order',
}).upgrade(transaction =>
  transaction.table<StoredExercise>('exercises').toCollection().modify((record) => {
    if (!record.exercise || typeof record.exercise !== 'object') return

    const exercise = record.exercise as Record<string, unknown>
    if (typeof exercise.mobileSolvable !== 'boolean') {
      exercise.mobileSolvable = true
    }
  }),
)

db.version(3).stores({
  exercises: '&key, source, order',
  trainingSessions: '&source',
})

db.version(4).stores({
  exercises: '&key, source, order',
  trainingSessions: '&source',
}).upgrade(transaction =>
  transaction.table<StoredExercise>('exercises').toCollection().modify((record) => {
    if (!record.exercise || typeof record.exercise !== 'object') return

    const exercise = record.exercise as Record<string, unknown>
    if (!Array.isArray(exercise.categories)) {
      exercise.categories = []
    }
  }),
)

db.version(5).stores({
  exercises: '&key, source, order',
  trainingSessions: '&source',
}).upgrade(transaction =>
  transaction.table<StoredExercise>('exercises').toCollection().modify((record) => {
    if (!record.exercise || typeof record.exercise !== 'object') return

    const exercise = record.exercise as Record<string, unknown>
    const categories = Array.isArray(exercise.categories)
      ? exercise.categories.filter(category => typeof category === 'string')
      : []

    exercise.specializations = migratedSpecializations(exercise, categories)
    exercise.categories = categories.filter(category =>
      category !== 'FIAN'
      && category !== 'FIAN AP1'
      && category !== 'FIAN AP2')
  }),
)

db.version(6).stores({
  exercises: '&key, source, order',
  trainingSessions: '&source',
}).upgrade(transaction =>
  transaction.table<StoredExercise>('exercises').toCollection().modify((record) => {
    if (!record.exercise || typeof record.exercise !== 'object') return

    const exercise = record.exercise as Record<string, unknown>
    const categories = Array.isArray(exercise.categories)
      ? exercise.categories.filter(category => typeof category === 'string')
      : []
    exercise.specializations = migratedSpecializations(exercise, categories)
  }),
)

db.version(7).stores({
  exercises: '&key, source, order',
  trainingSessions: '&source',
}).upgrade(async (transaction) => {
  const exerciseTable = transaction.table<StoredExercise>('exercises')
  const legacyExercises = await exerciseTable
    .where('source')
    .anyOf(legacyExerciseSources)
    .toArray()
  const migratedExercises = legacyExercises.flatMap((record) => {
    if (!record.exercise || typeof record.exercise !== 'object') return []

    const exercise = record.exercise as Record<string, unknown>
    const categories = Array.isArray(exercise.categories)
      ? exercise.categories.filter(category => typeof category === 'string')
      : []
    const exerciseId = typeof exercise.id === 'string'
      ? exercise.id
      : record.key.slice(record.source.length + 1)

    return migratedSpecializations(exercise, categories).map((specialization) => {
      const source = exerciseSetSource(record.source, specialization)
      return {
        ...record,
        key: `${source}:${exerciseId}`,
        source,
      }
    })
  })

  if (migratedExercises.length > 0) {
    await exerciseTable.bulkPut(migratedExercises)
  }
  if (legacyExercises.length > 0) {
    await exerciseTable.bulkDelete(legacyExercises.map(record => record.key))
  }

  const trainingSessionTable = transaction
    .table<StoredTrainingSession>('trainingSessions')
  const legacySessions = await trainingSessionTable
    .where('source')
    .anyOf(legacyExerciseSources)
    .toArray()
  const migratedSessions = legacySessions.flatMap(session =>
    allItSpecializations.map(specialization => ({
      ...session,
      source: exerciseSetSource(session.source, specialization),
    })))

  if (migratedSessions.length > 0) {
    await trainingSessionTable.bulkPut(migratedSessions)
  }
  if (legacySessions.length > 0) {
    await trainingSessionTable.bulkDelete(
      legacySessions.map(session => session.source),
    )
  }
})

db.version(8).stores({
  exercises: '&key, source, order',
  trainingSessions: '&source',
}).upgrade(transaction =>
  transaction.table<StoredExercise>('exercises').toCollection().modify((record) => {
    if (!record.exercise || typeof record.exercise !== 'object') return

    const exercise = record.exercise as Record<string, unknown>
    if (
      exercise.inputMode === 'TEXT'
      && typeof exercise.correct === 'string'
    ) {
      exercise.correct = [exercise.correct]
    }
  }),
)

db.version(9).stores({
  exercises: '&key, source, order',
  trainingSessions: '&source',
}).upgrade(transaction =>
  transaction.table<StoredExercise>('exercises').toCollection().modify((record) => {
    if (!record.exercise || typeof record.exercise !== 'object') return

    const exercise = record.exercise as Record<string, unknown>
    if (typeof exercise.correct === 'number') {
      exercise.correct = [exercise.correct]
    }
  }),
)

db.version(10).stores({
  exercises: '&key, source, order',
  trainingSessions: '&source',
  exerciseProgress: '&exerciseId, learningStatus, lastSeen',
  bookmarks: '&exerciseId, createdAt',
  practiceSessions: '&id, date',
  streaks: '&id, date',
  answerEvents: '&id, exerciseId, occurredAt',
  settings: '&id',
  metadata: '&key',
})

db.version(11).stores({
  exercises: '&key, source, order',
  trainingSessions: '&source',
  exerciseProgress: '&exerciseId, learningStatus, lastSeen',
  bookmarks: '&exerciseId, createdAt',
  practiceSessions: '&id, date',
  streaks: '&id, date',
  answerEvents: '&id, exerciseId, occurredAt',
  settings: '&id',
  metadata: '&key',
}).upgrade(async (transaction) => {
  await transaction.table<StoredExercise>('exercises').clear()
  await transaction
    .table<StoredExerciseProgress>('exerciseProgress')
    .toCollection()
    .modify((record) => {
      if (typeof record.xp === 'number') return
      record.xp = Math.round(
        record.correct * 2 + Math.min(record.wrong, 1) * 0.5 + record.box,
      )
    })
})

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

db.version(12).stores({
  exercises: '&key, source, order',
  trainingSessions: '&source',
  exerciseProgress: '&exerciseId, learningStatus, lastSeen',
  bookmarks: '&exerciseId, createdAt',
  practiceSessions: '&id, date, lastActivityAt, qualifiedAt',
  streaks: '&id, date, sessionId',
  answerEvents: '&id, exerciseId, occurredAt, sessionId',
  xpLedger: '&id, &idempotencyKey, localDate, occurredAt, bucket, reason, exerciseId, answerEventId, sessionId',
  settings: '&id',
  metadata: '&key',
}).upgrade(async (transaction) => {
  const answerEvents = transaction.table<StoredAnswerEvent>('answerEvents')
  await answerEvents.toCollection().modify((record) => {
    const scorePermille = typeof record.scorePermille === 'number'
      ? Math.min(1000, Math.max(0, Math.round(record.scorePermille)))
      : record.correct ? 1000 : 0
    record.scorePermille = scorePermille
    record.outcome = scorePermille === 1000
      ? 'correct'
      : scorePermille >= 500 ? 'partial' : 'incorrect'
    record.activeDurationMs ??= Math.min(
      Math.max(typeof record.durationMs === 'number' ? record.durationMs : 0, 0),
      120_000,
    )
    record.masteryXpMilli ??= Math.round((record.xpEarned ?? 0) * 1000)
    record.momentumXpMilli ??= 0
    record.policyVersion ??= 1
  })

  const progress = await transaction
    .table<StoredExerciseProgress>('exerciseProgress')
    .toArray()
  const ledger = transaction.table<StoredXpLedgerEntry>('xpLedger')
  const legacyEntries = progress.flatMap((record) => {
    const amountMilli = Math.round((record.xp ?? 0) * 1000)
    if (amountMilli <= 0) return []
    const occurredAt = record.lastSeen > 0 ? record.lastSeen : Date.now()
    const idempotencyKey = `legacy-xp:${record.exerciseId}`
    return [{
      id: `xp-${idempotencyKey}`,
      idempotencyKey,
      occurredAt,
      localDate: localDateKey(occurredAt),
      amountMilli,
      bucket: 'mastery' as const,
      reason: 'legacyMigration' as const,
      exerciseId: record.exerciseId,
      policyVersion: 1,
    }]
  })
  if (legacyEntries.length > 0) await ledger.bulkPut(legacyEntries)

  await transaction
    .table<StoredExerciseProgress>('exerciseProgress')
    .toCollection()
    .modify((record) => {
      record.partial ??= 0
      record.answerLog = record.answerLog.map((entry) => {
        const scorePermille = typeof entry.scorePermille === 'number'
          ? Math.min(1000, Math.max(0, Math.round(entry.scorePermille)))
          : entry.correct ? 1000 : 0
        return {
          ...entry,
          scorePermille,
          outcome: scorePermille === 1000
            ? 'correct'
            : scorePermille >= 500 ? 'partial' : 'incorrect',
        }
      })
    })
})
