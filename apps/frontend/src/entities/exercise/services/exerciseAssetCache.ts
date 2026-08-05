import type { Exercise } from '../exercise'

const EXERCISE_IMAGE_CACHE = 'exercise-images'
const EXERCISE_IMAGE_DIRECTORY = '/data/img'

function exerciseImageUrls(exercises: Exercise[]): string[] {
  return [
    ...new Set(
      exercises.flatMap(exercise =>
        exercise.images?.map(filename =>
          `${EXERCISE_IMAGE_DIRECTORY}/${filename}`) ?? []),
    ),
  ]
}

async function cacheImage(cache: Cache, url: string) {
  if (await cache.match(url)) return

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Exercise image could not be loaded (${response.status}).`)
  }
  await cache.put(url, response)
}

export async function cacheExerciseImages(
  exercises: Exercise[],
): Promise<void> {
  if (!('caches' in globalThis)) return

  const urls = exerciseImageUrls(exercises)
  if (urls.length === 0) return

  try {
    const cache = await caches.open(EXERCISE_IMAGE_CACHE)
    const results = await Promise.allSettled(
      urls.map(url => cacheImage(cache, url)),
    )
    const failures = results.filter(result => result.status === 'rejected')
    if (failures.length > 0) {
      console.warn(`${failures.length} exercise images could not be cached.`)
    }
  } catch (error) {
    console.warn('Exercise images could not be cached.', error)
  }
}
