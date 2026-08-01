import type { Exercise } from '../exercise'
import type { LearningLevel } from '../learningLevel'

export type ExamScope = 'AP1' | 'AP2'

export function examScopeForLevel(level: LearningLevel): ExamScope {
  return level <= 4 ? 'AP1' : 'AP2'
}

export function isInExamScope(
  exercise: Exercise,
  level: LearningLevel,
): boolean {
  const scope = examScopeForLevel(level)
  return scope === 'AP1'
    ? exercise.categories.includes('AP1')
    : exercise.categories.includes('AP2') || exercise.categories.includes('WiSo')
}

export function isWithinLearningLevel(
  exercise: Exercise,
  level: LearningLevel,
): boolean {
  return exercise.learningLevel <= level
}
