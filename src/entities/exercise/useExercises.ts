import { ref } from 'vue'
import type { Exercise } from './exercise'
import { useExerciseCatalog } from './useExerciseCatalog'

// Module-level singletons — persist across route changes
const exercises = ref<Exercise[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
let loaded = false

async function load() {
  if (loaded) return
  loaded = true
  try {
    const indexRes = await fetch('/data/exercises/index.json')
    const filenames: string[] = await indexRes.json()
    const results = await Promise.all(
      filenames.map(async (f) => {
        try {
          const res = await fetch(`/data/exercises/${f}`)
          const data = await res.json()
          data.id = f.replace(/\.json$/, '')
          return data as Exercise
        } catch {
          console.warn(`Failed to load exercise: ${f}`)
          return null
        }
      }),
    )
    exercises.value = results.filter((e): e is Exercise => e !== null)
    useExerciseCatalog().buildFromExercises(exercises.value)
  } catch (e) {
    error.value = String(e)
  } finally {
    isLoading.value = false
  }
}

// Start loading immediately on first import
load()

export function useExercises() {
  return { exercises, isLoading, error }
}
