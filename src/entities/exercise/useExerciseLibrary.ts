import { liveQuery, type Subscription } from 'dexie'
import { ref } from 'vue'
import { db } from '../../db/db'
import type { Exercise } from './exercise'

const exercisesById = ref(new Map<string, Exercise>())
let subscription: Subscription | undefined

function isExercise(value: unknown): value is Exercise {
  return !!value
    && typeof value === 'object'
    && typeof (value as Record<string, unknown>).id === 'string'
    && typeof (value as Record<string, unknown>).inputMode === 'string'
}

async function readLibrary(): Promise<Map<string, Exercise>> {
  const rows = await db.exercises.toArray()
  const library = new Map<string, Exercise>()
  for (const row of rows) {
    if (isExercise(row.exercise)) library.set(row.exercise.id, row.exercise)
  }
  return library
}

export async function initializeExerciseLibrary(): Promise<void> {
  exercisesById.value = await readLibrary()
  subscription?.unsubscribe()
  subscription = liveQuery(readLibrary).subscribe({
    next(library) {
      exercisesById.value = library
    },
    error(error) {
      console.warn('The cached exercise library could not be read.', error)
    },
  })
}

export function useExerciseLibrary() {
  function getExercise(exerciseId: string): Exercise | null {
    return exercisesById.value.get(exerciseId) ?? null
  }

  return { exercisesById, getExercise }
}
