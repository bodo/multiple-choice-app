export type InputMode = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TEXT' | 'NUMBER'

export interface Exercise {
  inputMode: InputMode
  correct: number | number[] | string
  instruction?: string
  images?: string[]
  answerOptions?: string[]
  submitButton?: boolean
  caseSensitive?: boolean
  maximumStringDistance?: number
  adminComment?: string
  adminTags?: string[]
}

export interface AnswerResult {
  isCorrect: boolean
  selectedIndices?: number[]
  submittedValue?: string
}
