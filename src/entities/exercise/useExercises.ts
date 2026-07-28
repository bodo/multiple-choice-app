import { liveQuery } from 'dexie'
import {
  ref,
  watch,
  type Ref,
  type WatchStopHandle,
} from 'vue'
import { db, type StoredExercise } from '../../db/db'
import type { Exercise } from './exercise'
import { ApiExerciseLoadingService } from './services/apiExerciseLoadingService'
import {
  type ExerciseLoadingService,
  type ExerciseLoadingSource,
} from './services/exerciseLoadingService'
import { JsonUrlExerciseLoadingService } from './services/jsonUrlExerciseLoadingService'
import { useExerciseCatalog } from './useExerciseCatalog'

// Module-level singletons — persist across route changes
const exercises = ref<Exercise[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
const activeSource = ref<ExerciseLoadingSource>('json')
const services: Record<ExerciseLoadingSource, ExerciseLoadingService> = {
  json: new JsonUrlExerciseLoadingService(),
  api: new ApiExerciseLoadingService(),
}

let loadVersion = 0
let stopDatabaseSubscription: (() => void) | undefined
let stopSourceWatch: WatchStopHandle | undefined

function getErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

function toStoredExercise(
  exercise: Exercise,
  source: ExerciseLoadingSource,
  order: number,
): StoredExercise {
  return {
    key: `${source}:${exercise.id}`,
    source,
    order,
    exercise,
  }
}

async function replaceStoredExercises(
  source: ExerciseLoadingSource,
  loadedExercises: Exercise[],
) {
  await db.transaction('rw', db.exercises, async () => {
    await db.exercises.where('source').equals(source).delete()
    await db.exercises.bulkAdd(
      loadedExercises.map((exercise, order) =>
        toStoredExercise(exercise, source, order)),
    )
  })
}

async function readStoredExercises(source: ExerciseLoadingSource) {
  return db.exercises.where('source').equals(source).sortBy('order')
}

function publishStoredExercises(rows: StoredExercise[]) {
  exercises.value = rows.map(row => row.exercise as Exercise)
  useExerciseCatalog().buildFromExercises(exercises.value)
}

function subscribeToStoredExercises(source: ExerciseLoadingSource) {
  stopDatabaseSubscription?.()
  const subscription = liveQuery(
    () => readStoredExercises(source),
  ).subscribe({
    next(rows) {
      publishStoredExercises(rows)
    },
    error(databaseError) {
      error.value = getErrorMessage(databaseError)
    },
  })
  stopDatabaseSubscription = () => subscription.unsubscribe()
}

async function load(source: ExerciseLoadingSource) {
  const currentLoadVersion = ++loadVersion
  activeSource.value = source
  subscribeToStoredExercises(source)
  isLoading.value = true
  error.value = null

  try {
    const loadedExercises = await services[source].loadExercises()
    if (currentLoadVersion !== loadVersion) return
    await replaceStoredExercises(source, loadedExercises)
    const storedExercises = await readStoredExercises(source)
    if (currentLoadVersion !== loadVersion) return
    publishStoredExercises(storedExercises)
  } catch (loadError) {
    if (currentLoadVersion === loadVersion) {
      error.value = getErrorMessage(loadError)
    }
  } finally {
    if (currentLoadVersion === loadVersion) {
      isLoading.value = false
    }
  }
}

export function initializeExerciseLoading(
  source: Readonly<Ref<ExerciseLoadingSource>>,
) {
  stopSourceWatch?.()
  stopSourceWatch = watch(source, load, { immediate: true })
}

export function useExercises() {
  return { exercises, isLoading, error, activeSource }
}
