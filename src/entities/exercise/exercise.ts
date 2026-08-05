export type InputMode =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'TEXT'
  | 'NUMBER'
  | 'MATCH'
export type ExerciseSpecialization = 'FIAN' | 'FISI' | 'FIDP' | 'FIDV'
export type ExerciseDifficulty = 1 | 2 | 3 | 4 | 5
export type { AnswerOutcome } from './answerOutcome'

export interface Exercise {
  id: string
  inputMode: InputMode
  mobileSolvable: boolean
  learningLevel: import('./learningLevel').LearningLevel
  difficulty: ExerciseDifficulty
  categories: string[]
  specializations: ExerciseSpecialization[]
  correct: number[] | string[]
  instruction?: string
  images?: string[]
  answerOptions?: string[]
  matchOptions?: string[]
  submitButton?: boolean
  caseSensitive?: boolean
  maximumStringDistance?: number
  explainInstruction?: string
  explainAnswerOptions?: string[]
  adminComment?: string
  adminTags?: string[]
}

export interface AnswerResult {
  isCorrect: boolean
  scorePermille?: number
  outcome?: import('./answerOutcome').AnswerOutcome
  isCloseMatch?: boolean
  selectedIndices?: number[]
  submittedMatches?: number[]
  submittedValue?: string
}
