import { liveQuery } from 'dexie'
import {
  ref,
  watch,
  type Ref,
  type WatchStopHandle,
} from 'vue'
import { db, type StoredExercise } from '../../db/db'
import type { Exercise, ExerciseSpecialization } from './exercise'
import { ApiExerciseLoadingService } from './services/apiExerciseLoadingService'
import { cacheExerciseImages } from './services/exerciseAssetCache'
import {
  getExerciseSetKey,
  type ExerciseLoadingService,
  type ExerciseLoadingSource,
  type ExerciseSetKey,
} from './services/exerciseLoadingService'
import { JsonUrlExerciseLoadingService } from './services/jsonUrlExerciseLoadingService'
import { useExerciseCatalog } from './useExerciseCatalog'

// Module-level singletons — persist across route changes
const exercises = ref<Exercise[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
const activeSource = ref<ExerciseLoadingSource>('json')
const activeExerciseSetKey = ref<ExerciseSetKey>('json:FIAN')
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
  source: ExerciseSetKey,
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
  source: ExerciseSetKey,
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

async function readStoredExercises(source: ExerciseSetKey) {
  return db.exercises.where('source').equals(source).sortBy('order')
}

function publishStoredExercises(rows: StoredExercise[]) {
  exercises.value = rows.map(row => row.exercise as Exercise)
  useExerciseCatalog().buildFromExercises(exercises.value)
}

function subscribeToStoredExercises(source: ExerciseSetKey) {
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

async function load(
  source: ExerciseLoadingSource,
  specialization: ExerciseSpecialization,
  online: boolean,
) {
  const currentLoadVersion = ++loadVersion
  const exerciseSetKey = getExerciseSetKey(source, specialization)
  activeSource.value = source
  activeExerciseSetKey.value = exerciseSetKey
  subscribeToStoredExercises(exerciseSetKey)
  isLoading.value = true
  error.value = null

  try {
    const cachedExercises = await readStoredExercises(exerciseSetKey)
    if (currentLoadVersion !== loadVersion) return
    publishStoredExercises(cachedExercises)

    if (!online) {
      if (cachedExercises.length === 0) {
        error.value = 'You are offline and this specialization has not been downloaded yet.'
      }
      return
    }

    const loadedExercises = await services[source]
      .loadExercises(specialization)
    if (currentLoadVersion !== loadVersion) return
    await replaceStoredExercises(exerciseSetKey, loadedExercises)
    await cacheExerciseImages(loadedExercises)
    const storedExercises = await readStoredExercises(exerciseSetKey)
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
  specialization: Readonly<Ref<ExerciseSpecialization>>,
  isOnline: Readonly<Ref<boolean>>,
) {
  stopSourceWatch?.()
  stopSourceWatch = watch(
    [source, specialization, isOnline],
    ([newSource, newSpecialization, online]) =>
      load(newSource, newSpecialization, online),
    { immediate: true },
  )
}

export function useExercises() {
  return {
    exercises,
    isLoading,
    error,
    activeSource,
    activeExerciseSetKey,
  }
}
