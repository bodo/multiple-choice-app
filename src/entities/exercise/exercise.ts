export type InputMode = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TEXT' | 'NUMBER'

export interface Exercise {
  id: string
  inputMode: InputMode
  correct: number | number[] | string
  instruction?: string
  images?: string[]
  answerOptions?: string[]
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
  isCloseMatch?: boolean
  selectedIndices?: number[]
  submittedValue?: string
}
