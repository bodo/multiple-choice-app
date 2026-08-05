import type {
  Exercise,
  ExerciseSpecialization,
  InputMode,
} from '../exercise'
import { validateTextAnswer } from '../textAnswerMatching'

export type ExerciseLoadingSource = 'json' | 'api'
export type ExerciseSetKey =
  `${ExerciseLoadingSource}:${ExerciseSpecialization}`

export interface ExerciseLoadingService {
  loadExercises(specialization: ExerciseSpecialization): Promise<Exercise[]>
}

export function getExerciseSetKey(
  source: ExerciseLoadingSource,
  specialization: ExerciseSpecialization,
): ExerciseSetKey {
  return `${source}:${specialization}`
}

const inputModes: InputMode[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TEXT',
  'NUMBER',
  'MATCH',
]
const specializations: ExerciseSpecialization[] = [
  'FIAN',
  'FISI',
  'FIDP',
  'FIDV',
]

function isValidIndex(value: unknown, optionCount: number): value is number {
  return Number.isInteger(value)
    && (value as number) >= 0
    && (value as number) < optionCount
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number) {
  return Number.isInteger(value)
    && (value as number) >= minimum
    && (value as number) <= maximum
}

function isValidStringList(value: unknown, allowEmpty = true): value is string[] {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.every(item => typeof item === 'string' && item.trim().length > 0)
    && new Set(value).size === value.length
}

function isValidIndexList(
  value: unknown,
  optionCount: number,
  expectedLength?: number,
): value is number[] {
  return Array.isArray(value)
    && value.length > 0
    && (expectedLength === undefined || value.length === expectedLength)
    && value.every(item => isValidIndex(item, optionCount))
    && new Set(value).size === value.length
}

function isValidNumberList(
  value: unknown,
  expectedLength: number,
): value is number[] {
  return Array.isArray(value)
    && value.length === expectedLength
    && value.every(item => typeof item === 'number' && Number.isFinite(item))
}

function hasValidAnswer(
  candidate: Record<string, unknown>,
  inputMode: InputMode,
): boolean {
  const answerOptions = candidate.answerOptions

  if (inputMode === 'TEXT') {
    if (
      !isValidStringList(candidate.correct, false)
      || (
        candidate.caseSensitive !== undefined
        && typeof candidate.caseSensitive !== 'boolean'
      )
      || (
        candidate.maximumStringDistance !== undefined
        && (
          !Number.isInteger(candidate.maximumStringDistance)
          || (candidate.maximumStringDistance as number) < 0
        )
      )
    ) return false

    try {
      candidate.correct.forEach(answer =>
        validateTextAnswer(answer, candidate.caseSensitive === true))
      return true
    } catch {
      return false
    }
  }
  if (inputMode === 'NUMBER') {
    return isValidNumberList(candidate.correct, 1)
  }
  if (!isValidStringList(answerOptions, false)) return false

  if (inputMode === 'SINGLE_CHOICE') {
    return isValidIndexList(candidate.correct, answerOptions.length, 1)
  }
  if (inputMode === 'MULTIPLE_CHOICE') {
    return isValidIndexList(candidate.correct, answerOptions.length)
  }

  const matchOptions = candidate.matchOptions
  return isValidStringList(matchOptions, false)
    && matchOptions.length === answerOptions.length
    && isValidIndexList(
      candidate.correct,
      matchOptions.length,
      answerOptions.length,
    )
}

function parseSpecializations(
  value: unknown,
  exerciseId: string,
): ExerciseSpecialization[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || new Set(value).size !== value.length
    || !value.every(item =>
      typeof item === 'string'
      && specializations.includes(item as ExerciseSpecialization))
  ) {
    throw new Error(`Exercise "${exerciseId}" has invalid specializations.`)
  }
  return value as ExerciseSpecialization[]
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
  if (!isIntegerInRange(candidate.learningLevel, 1, 10)) {
    throw new Error(`Exercise "${id}" has an invalid learning level.`)
  }
  if (!isIntegerInRange(candidate.difficulty, 1, 5)) {
    throw new Error(`Exercise "${id}" has an invalid difficulty.`)
  }
  if (!isValidStringList(candidate.categories, false)) {
    throw new Error(`Exercise "${id}" must have at least one valid category.`)
  }
  if (
    candidate.adminTags !== undefined
    && !isValidStringList(candidate.adminTags)
  ) {
    throw new Error(`Exercise "${id}" has invalid admin tags.`)
  }
  if (
    candidate.submitButton !== undefined
    && typeof candidate.submitButton !== 'boolean'
  ) {
    throw new Error(`Exercise "${id}" has an invalid submit-button flag.`)
  }
  if (!hasValidAnswer(candidate, candidate.inputMode as InputMode)) {
    throw new Error(`Exercise "${id}" has invalid answer data.`)
  }

  const mobileSolvable = candidate.mobileSolvable !== false
  const exerciseSpecializations = parseSpecializations(
    candidate.specializations,
    id,
  )
  return {
    ...candidate,
    id,
    mobileSolvable,
    specializations: exerciseSpecializations,
  } as unknown as Exercise
}
