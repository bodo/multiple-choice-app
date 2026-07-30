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
