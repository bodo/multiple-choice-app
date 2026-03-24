import { ref, onMounted } from 'vue'
import type { Exercise } from './exercise'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function useExercises() {
  const exercises = ref<Exercise[]>([])
  const isLoading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    try {
      const indexRes = await fetch('/data/exercises/index.json')
      const filenames: string[] = await indexRes.json()
      const loaded = await Promise.all(
        filenames.map(async (f) => {
          try {
            const res = await fetch(`/data/exercises/${f}`)
            return (await res.json()) as Exercise
          } catch {
            console.warn(`Failed to load exercise: ${f}`)
            return null
          }
        }),
      )
      exercises.value = shuffle(loaded.filter((e): e is Exercise => e !== null))
    } catch (e) {
      error.value = String(e)
    } finally {
      isLoading.value = false
    }
  }

  onMounted(load)

  return { exercises, isLoading, error }
}
