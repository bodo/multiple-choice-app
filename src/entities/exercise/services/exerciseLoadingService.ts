import type { Exercise, InputMode } from '../exercise'

export type ExerciseLoadingSource = 'json' | 'api'

export interface ExerciseLoadingService {
  loadExercises(): Promise<Exercise[]>
}

const inputModes: InputMode[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TEXT',
  'NUMBER',
]

function hasValidCorrectAnswer(value: unknown): boolean {
  return typeof value === 'number'
    || typeof value === 'string'
    || (Array.isArray(value) && value.every(item => typeof item === 'number'))
}

export function parseExercise(value: unknown, fallbackId?: string): Exercise {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Exercise must be an object.')
  }

  const candidate = value as Record<string, unknown>
  const id = fallbackId ?? candidate.id

  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Exercise id is missing.')
  }
  if (!inputModes.includes(candidate.inputMode as InputMode)) {
    throw new Error(`Exercise "${id}" has an invalid input mode.`)
  }
  if (typeof candidate.mobileSolvable !== 'boolean') {
    throw new Error(`Exercise "${id}" has an invalid mobile-solvable flag.`)
  }
  if (!hasValidCorrectAnswer(candidate.correct)) {
    throw new Error(`Exercise "${id}" has an invalid correct answer.`)
  }

  const mobileSolvable = candidate.mobileSolvable !== false
  return { ...candidate, id, mobileSolvable } as unknown as Exercise
}
