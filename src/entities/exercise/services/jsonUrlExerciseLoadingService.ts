import type { Exercise } from '../exercise'
import {
  type ExerciseLoadingService,
  parseExercise,
} from './exerciseLoadingService'

const DEFAULT_EXERCISE_DIRECTORY_URL = '/data/exercises'

export class JsonUrlExerciseLoadingService implements ExerciseLoadingService {
  private readonly directoryUrl: string
  private readonly fetcher: typeof fetch

  constructor(
    directoryUrl = DEFAULT_EXERCISE_DIRECTORY_URL,
    fetcher: typeof fetch = globalThis.fetch,
  ) {
    this.directoryUrl = directoryUrl
    this.fetcher = fetcher.bind(globalThis)
  }

  async loadExercises(): Promise<Exercise[]> {
    const filenames = await this.loadIndex()
    const exercises = await Promise.all(
      filenames.map(filename => this.loadExercise(filename)),
    )
    const loadedExercises = exercises.filter(
      (exercise): exercise is Exercise => exercise !== null,
    )

    if (filenames.length > 0 && loadedExercises.length === 0) {
      throw new Error('No exercise files could be loaded.')
    }
    return loadedExercises
  }

  private async loadIndex(): Promise<string[]> {
    const response = await this.fetcher(`${this.directoryUrl}/index.json`)
    if (!response.ok) {
      throw new Error(`Exercise index could not be loaded (${response.status}).`)
    }

    const value: unknown = await response.json()
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
      throw new Error('Exercise index has an invalid format.')
    }
    return value
  }

  private async loadExercise(filename: string): Promise<Exercise | null> {
    try {
      const response = await this.fetcher(`${this.directoryUrl}/${filename}`)
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}).`)
      }

      const id = filename.replace(/\.json$/, '')
      return parseExercise(await response.json(), id)
    } catch (error) {
      console.warn(`Failed to load exercise "${filename}".`, error)
      return null
    }
  }
}
