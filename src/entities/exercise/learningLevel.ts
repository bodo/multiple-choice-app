export const learningLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

export type LearningLevel = typeof learningLevels[number]

export interface LearningLevelDefinition {
  value: LearningLevel
  labelKey: string
}

export const learningLevelDefinitions: LearningLevelDefinition[] = [
  { value: 1, labelKey: 'learningLevelWarmup' },
  { value: 2, labelKey: 'learningLevelAp1Essentials' },
  { value: 3, labelKey: 'learningLevelAp1Core' },
  { value: 4, labelKey: 'learningLevelAp1Advanced' },
  { value: 5, labelKey: 'learningLevelAp2Preview' },
  { value: 6, labelKey: 'learningLevelAp2Essentials' },
  { value: 7, labelKey: 'learningLevelAp2Core' },
  { value: 8, labelKey: 'learningLevelAp2Advanced' },
  { value: 9, labelKey: 'learningLevelProfessional' },
  { value: 10, labelKey: 'learningLevelSpecialization' },
]

export function normalizeLearningLevel(
  value: unknown,
  fallback: LearningLevel = 1,
): LearningLevel {
  return typeof value === 'number'
    && Number.isInteger(value)
    && learningLevels.includes(value as LearningLevel)
    ? value as LearningLevel
    : fallback
}
