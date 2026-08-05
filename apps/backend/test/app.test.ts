import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Exercise, ExerciseRepository } from '../src/exercise.js'
import { buildApp } from '../dist/app.js'
import { config } from '../dist/config.js'

const demoExercise: Exercise = {
  id: 'demo_test',
  inputMode: 'SINGLE_CHOICE',
  mobileSolvable: true,
  learningLevel: 1,
  difficulty: 1,
  categories: ['AP1'],
  specializations: ['FIAN'],
  instruction: 'Testfrage?',
  images: [],
  answerOptions: ['Ja', 'Nein'],
  matchOptions: [],
  correct: [0],
  submitButton: true,
  caseSensitive: false,
  maximumStringDistance: 1,
  explainInstruction: 'Ja ist richtig.',
  explainAnswerOptions: [],
  adminComment: '',
  adminTags: ['demo'],
  contentRevision: 1,
  isActive: true,
  createdAt: '2026-08-05T12:00:00Z',
  updatedAt: '2026-08-05T12:00:00Z',
}

class FakeRepository implements ExerciseRepository {
  async findAll(): Promise<Exercise[]> {
    return [demoExercise]
  }
}

test('GET /api/v1/exercises returns repository rows', async () => {
  const app = await buildApp({
    repository: new FakeRepository(),
    openApiPath: config.openApiPath,
  })

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/exercises',
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { items: [demoExercise] })
  await app.close()
})

test('OpenAPI JSON documents the versioned exercise endpoint', async () => {
  const app = await buildApp({
    repository: new FakeRepository(),
    openApiPath: config.openApiPath,
  })

  const response = await app.inject({
    method: 'GET',
    url: '/api/docs/json',
  })
  const specification = response.json() as { paths: Record<string, unknown> }

  assert.equal(response.statusCode, 200)
  assert.ok(specification.paths['/api/v1/exercises'])
  await app.close()
})

test('unknown API routes return JSON instead of the SPA', async () => {
  const app = await buildApp({
    repository: new FakeRepository(),
    openApiPath: config.openApiPath,
  })

  const response = await app.inject({ method: 'GET', url: '/api/v1/missing' })

  assert.equal(response.statusCode, 404)
  assert.equal(response.json().message, 'Route not found.')
  await app.close()
})
