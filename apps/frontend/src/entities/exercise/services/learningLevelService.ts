import type { Exercise } from '../exercise'
import {
  learningLevels,
  type LearningLevel,
} from '../learningLevel'
import { getRecord } from '../useExerciseHistory'

export interface LearningLevelAssessment {
  currentLevel: LearningLevel
  recommendedLevel: LearningLevel
  attemptedCards: number
  requiredCards: number
  recentAccuracy: number
  masteredRatio: number
  ready: boolean
}

const REQUIRED_ACCURACY = 0.8
const REQUIRED_MASTERY = 0.6

function nextLevelWithExercises(
  exercises: Exercise[],
  currentLevel: LearningLevel,
): LearningLevel | null {
  return learningLevels.find(level =>
    level > currentLevel
    && exercises.some(exercise => exercise.learningLevel === level)) ?? null
}

export function assessLearningLevel(
  exercises: Exercise[],
  currentLevel: LearningLevel,
): LearningLevelAssessment {
  const levelExercises = exercises.filter(
    exercise => exercise.learningLevel === currentLevel,
  )
  const records = levelExercises
    .map(exercise => getRecord(exercise.id))
    .filter(record => record.correct + record.wrong > 0)
  const recentAnswers = records.flatMap(record =>
    record.answerLog.filter(answer => answer.mode !== 'exam'))
  const attemptedCards = records.length
  const requiredCards = Math.min(
    20,
    Math.max(5, Math.ceil(levelExercises.length * 0.2)),
  )
  const recentAccuracy = recentAnswers.length === 0
    ? 0
    : recentAnswers.filter(answer => answer.correct).length / recentAnswers.length
  const masteredRatio = attemptedCards === 0
    ? 0
    : records.filter(record => record.box >= 2).length / attemptedCards
  const nextLevel = nextLevelWithExercises(exercises, currentLevel)
  const ready = nextLevel !== null
    && attemptedCards >= requiredCards
    && recentAccuracy >= REQUIRED_ACCURACY
    && masteredRatio >= REQUIRED_MASTERY

  return {
    currentLevel,
    recommendedLevel: ready ? nextLevel : currentLevel,
    attemptedCards,
    requiredCards,
    recentAccuracy,
    masteredRatio,
    ready,
  }
}
