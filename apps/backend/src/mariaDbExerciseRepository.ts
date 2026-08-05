import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise'
import type { Exercise, ExerciseRepository, ExerciseValue } from './exercise.js'

interface MariaDbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

interface ExerciseRow extends RowDataPacket {
  id: string
  inputMode: string
  mobileSolvable: number
  learningLevel: number
  difficulty: number
  categories: unknown
  specializations: unknown
  instruction: string
  images: unknown
  answerOptions: unknown
  matchOptions: unknown
  correct: unknown
  submitButton: number
  caseSensitive: number
  maximumStringDistance: number
  explainInstruction: string
  explainAnswerOptions: unknown
  adminComment: string
  adminTags: unknown
  contentRevision: number
  isActive: number
  createdAt: string
  updatedAt: string
}

function parseJson(value: unknown, column: string): ExerciseValue[] {
  if (Array.isArray(value)) {
    return value as ExerciseValue[]
  }
  if (typeof value !== 'string') {
    throw new Error(`Column ${column} does not contain a JSON array.`)
  }
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) {
    throw new Error(`Column ${column} does not contain a JSON array.`)
  }
  return parsed as ExerciseValue[]
}

function normalizeExercise(row: ExerciseRow): Exercise {
  return {
    ...row,
    mobileSolvable: Boolean(row.mobileSolvable),
    categories: parseJson(row.categories, 'categories') as string[],
    specializations: parseJson(row.specializations, 'specializations') as string[],
    images: parseJson(row.images, 'images') as string[],
    answerOptions: parseJson(row.answerOptions, 'answerOptions') as string[],
    matchOptions: parseJson(row.matchOptions, 'matchOptions') as string[],
    correct: parseJson(row.correct, 'correct') as Array<number | string>,
    submitButton: Boolean(row.submitButton),
    caseSensitive: Boolean(row.caseSensitive),
    explainAnswerOptions: parseJson(
      row.explainAnswerOptions,
      'explainAnswerOptions',
    ) as string[],
    adminTags: parseJson(row.adminTags, 'adminTags') as string[],
    isActive: Boolean(row.isActive),
    createdAt: `${row.createdAt.replace(' ', 'T')}Z`,
    updatedAt: `${row.updatedAt.replace(' ', 'T')}Z`,
  }
}

export class MariaDbExerciseRepository implements ExerciseRepository {
  private readonly pool: Pool

  constructor(databaseConfig: MariaDbConfig) {
    this.pool = mysql.createPool({
      ...databaseConfig,
      connectionLimit: 10,
      dateStrings: true,
      timezone: 'Z',
    })
  }

  async findAll(): Promise<Exercise[]> {
    const [rows] = await this.pool.query<ExerciseRow[]>(
      'SELECT * FROM exercises',
    )
    return rows.map(normalizeExercise)
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
