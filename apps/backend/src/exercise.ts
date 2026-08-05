export type ExerciseValue = boolean | number | string | ExerciseValue[]

export interface Exercise {
  id: string
  inputMode: string
  mobileSolvable: boolean
  learningLevel: number
  difficulty: number
  categories: string[]
  specializations: string[]
  instruction: string
  images: string[]
  answerOptions: string[]
  matchOptions: string[]
  correct: Array<number | string>
  submitButton: boolean
  caseSensitive: boolean
  maximumStringDistance: number
  explainInstruction: string
  explainAnswerOptions: string[]
  adminComment: string
  adminTags: string[]
  contentRevision: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ExerciseRepository {
  findAll(): Promise<Exercise[]>
  close?(): Promise<void>
}
