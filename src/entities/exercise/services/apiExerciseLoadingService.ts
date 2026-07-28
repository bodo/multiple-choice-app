import type { Exercise } from '../exercise'
import {
  type ExerciseLoadingService,
  parseExercise,
} from './exerciseLoadingService'

interface ExerciseListResponse {
  items: unknown[]
}

function getApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_EXERCISE_API_URL?.trim()
  return (configuredUrl || '/api/v1').replace(/\/$/, '')
}

export class ApiExerciseLoadingService implements ExerciseLoadingService {
  private readonly apiBaseUrl: string
  private readonly fetcher: typeof fetch

  constructor(
    apiBaseUrl = getApiBaseUrl(),
    fetcher: typeof fetch = globalThis.fetch,
  ) {
    this.apiBaseUrl = apiBaseUrl
    this.fetcher = fetcher.bind(globalThis)
  }

  async loadExercises(): Promise<Exercise[]> {
    const response = await this.fetcher(`${this.apiBaseUrl}/exercises`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`Exercise API could not be loaded (${response.status}).`)
    }

    const payload = this.parseResponse(await response.json())
    return payload.items.map((item, index) => {
      try {
        return parseExercise(item)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
          `Invalid API exercise at position ${index}: ${message}`,
          { cause: error },
        )
      }
    })
  }

  private parseResponse(value: unknown): ExerciseListResponse {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Exercise API response must be an object.')
    }

    const items = (value as Record<string, unknown>).items
    if (!Array.isArray(items)) {
      throw new Error('Exercise API response must contain an items array.')
    }
    return { items }
  }
}
