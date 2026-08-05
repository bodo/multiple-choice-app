import { distance } from 'fastest-levenshtein'

const regexAnswerSyntax = /^\/([\s\S]+)\/([^/]*)$/
const supportedRegexFlags = /^[iu]*$/
const defaultMaximumStringDistance = 1

export interface TextAnswerMatchingOptions {
  caseSensitive?: boolean
  maximumStringDistance?: number
}

export interface TextAnswerEvaluation {
  isCorrect: boolean
  isCloseMatch: boolean
}

function normalize(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value : value.toLowerCase()
}

function createRegex(
  answer: string,
  caseSensitive: boolean,
): RegExp | null {
  const match = regexAnswerSyntax.exec(answer)
  if (!match) return null

  const [, source, configuredFlags] = match
  if (
    !supportedRegexFlags.test(configuredFlags)
    || new Set(configuredFlags).size !== configuredFlags.length
  ) {
    throw new Error(
      `Unsupported regular-expression flags in text answer "${answer}".`,
    )
  }

  const flags = new Set(configuredFlags)
  if (!caseSensitive) flags.add('i')
  return new RegExp(`^(?:${source})$`, [...flags].join(''))
}

function isExactLiteralMatch(
  given: string,
  answer: string,
  caseSensitive: boolean,
): boolean {
  return normalize(given, caseSensitive) === normalize(answer, caseSensitive)
}

function isFuzzyLiteralMatch(
  given: string,
  answer: string,
  caseSensitive: boolean,
  maximumStringDistance: number,
): boolean {
  const givenWords = given.split(/\s+/)
  const answerWords = answer.split(/\s+/)
  if (givenWords.length !== answerWords.length) return false

  return givenWords.every((word, index) =>
    distance(
      normalize(word, caseSensitive),
      normalize(answerWords[index] ?? '', caseSensitive),
    ) <= maximumStringDistance)
}

export function isRegexTextAnswer(answer: string): boolean {
  return regexAnswerSyntax.test(answer)
}

export function validateTextAnswer(
  answer: string,
  caseSensitive = false,
): void {
  createRegex(answer, caseSensitive)
}

export function evaluateTextAnswer(
  given: string,
  answers: string[],
  options: TextAnswerMatchingOptions = {},
): TextAnswerEvaluation {
  const trimmedGiven = given.trim()
  const caseSensitive = options.caseSensitive === true
  const maximumStringDistance = options.maximumStringDistance
    ?? defaultMaximumStringDistance
  const literalAnswers = answers.filter(answer => !isRegexTextAnswer(answer))

  if (literalAnswers.some(answer =>
    isExactLiteralMatch(trimmedGiven, answer.trim(), caseSensitive))) {
    return { isCorrect: true, isCloseMatch: false }
  }

  if (answers.some((answer) => {
    const regex = createRegex(answer, caseSensitive)
    return regex?.test(trimmedGiven) === true
  })) {
    return { isCorrect: true, isCloseMatch: false }
  }

  const isFuzzyMatch = literalAnswers.some(answer =>
    isFuzzyLiteralMatch(
      trimmedGiven,
      answer.trim(),
      caseSensitive,
      maximumStringDistance,
    ))

  return {
    isCorrect: isFuzzyMatch,
    isCloseMatch: isFuzzyMatch,
  }
}
