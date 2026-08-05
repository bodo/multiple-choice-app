import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSessionCardSelectionState,
  getTrainingExerciseWeight,
  pickWeightedIndex,
} from '../src/entities/exercise/services/trainingExerciseSelectionService.ts'

test('current-level cards receive a bounded per-card boost', () => {
  const sessionState = {
    lastOutcome: null,
    distinctCardsSinceLastAnswer: 0,
  } as const

  assert.equal(getTrainingExerciseWeight({
    spacedRepetitionWeight: 4,
    isCurrentLevel: false,
    sessionState,
  }), 4)
  assert.equal(getTrainingExerciseWeight({
    spacedRepetitionWeight: 4,
    isCurrentLevel: true,
    sessionState,
  }), 8)
})

test('a correct card is blocked for the rest of its session', () => {
  assert.equal(getTrainingExerciseWeight({
    spacedRepetitionWeight: 10,
    isCurrentLevel: true,
    sessionState: {
      lastOutcome: 'correct',
      distinctCardsSinceLastAnswer: 20,
    },
  }), 0)
})

test('an incorrect or partial card waits for five distinct other cards', () => {
  for (const lastOutcome of ['incorrect', 'partial'] as const) {
    assert.equal(getTrainingExerciseWeight({
      spacedRepetitionWeight: 10,
      isCurrentLevel: false,
      sessionState: {
        lastOutcome,
        distinctCardsSinceLastAnswer: 4,
      },
    }), 0)
    assert.equal(getTrainingExerciseWeight({
      spacedRepetitionWeight: 0,
      isCurrentLevel: false,
      sessionState: {
        lastOutcome,
        distinctCardsSinceLastAnswer: 5,
      },
    }), 10)
  }
})

test('the retry gap counts distinct cards after the latest answer', () => {
  const state = getSessionCardSelectionState('target', [
    { exerciseId: 'target', outcome: 'incorrect' },
    { exerciseId: 'a', outcome: 'correct' },
    { exerciseId: 'a', outcome: 'incorrect' },
    { exerciseId: 'b', outcome: 'correct' },
    { exerciseId: 'c', outcome: 'correct' },
    { exerciseId: 'd', outcome: 'correct' },
    { exerciseId: 'e', outcome: 'correct' },
  ])

  assert.deepEqual(state, {
    lastOutcome: 'incorrect',
    distinctCardsSinceLastAnswer: 5,
  })
})

test('weighted selection has no fallback when every card is blocked', () => {
  assert.equal(pickWeightedIndex([0, 0], () => 0), -1)
  assert.equal(pickWeightedIndex([0, 3], () => 0), 1)
  assert.equal(pickWeightedIndex([2, 0, 3], () => 0.999), 2)
})
