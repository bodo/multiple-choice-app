const stringArraySchema = {
  type: 'array',
  items: { type: 'string' },
} as const

const mixedAnswerArraySchema = {
  type: 'array',
  minItems: 1,
  items: {
    anyOf: [{ type: 'number' }, { type: 'string' }],
  },
} as const

export const exerciseSchema = {
  type: 'object',
  required: [
    'id',
    'inputMode',
    'mobileSolvable',
    'learningLevel',
    'difficulty',
    'categories',
    'specializations',
    'instruction',
    'images',
    'answerOptions',
    'matchOptions',
    'correct',
    'submitButton',
    'caseSensitive',
    'maximumStringDistance',
    'explainInstruction',
    'explainAnswerOptions',
    'adminComment',
    'adminTags',
    'contentRevision',
    'isActive',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string' },
    inputMode: {
      type: 'string',
      enum: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TEXT', 'NUMBER', 'MATCH'],
    },
    mobileSolvable: { type: 'boolean' },
    learningLevel: { type: 'integer', minimum: 1, maximum: 10 },
    difficulty: { type: 'integer', minimum: 1, maximum: 5 },
    categories: stringArraySchema,
    specializations: stringArraySchema,
    instruction: { type: 'string' },
    images: stringArraySchema,
    answerOptions: stringArraySchema,
    matchOptions: stringArraySchema,
    correct: mixedAnswerArraySchema,
    submitButton: { type: 'boolean' },
    caseSensitive: { type: 'boolean' },
    maximumStringDistance: { type: 'integer', minimum: 0 },
    explainInstruction: { type: 'string' },
    explainAnswerOptions: stringArraySchema,
    adminComment: { type: 'string' },
    adminTags: stringArraySchema,
    contentRevision: { type: 'integer', minimum: 1 },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const

export const exerciseListSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: exerciseSchema,
    },
  },
} as const

export const problemSchema = {
  type: 'object',
  required: ['statusCode', 'error', 'message'],
  properties: {
    statusCode: { type: 'integer' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
} as const
