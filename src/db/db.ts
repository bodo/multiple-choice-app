import Dexie, { type EntityTable } from 'dexie'

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

type MultipleChoiceDatabase = Dexie & {
  exercises: EntityTable<StoredExercise, 'key'>
  trainingSessions: EntityTable<StoredTrainingSession, 'source'>
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
