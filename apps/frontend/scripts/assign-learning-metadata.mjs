import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const exerciseDirectory = new URL('../public/data/exercises/', import.meta.url)
const writeChanges = process.argv.includes('--write')
const baseDifficulty = {
  SINGLE_CHOICE: 1,
  MULTIPLE_CHOICE: 2,
  TEXT: 2,
  NUMBER: 2,
  MATCH: 3,
}

function estimateDifficulty(exercise) {
  let difficulty = baseDifficulty[exercise.inputMode] ?? 2
  const instructionLength = exercise.instruction?.length ?? 0
  if (instructionLength > 300) difficulty++
  if (instructionLength > 900) difficulty++
  if (exercise.images?.length) difficulty++
  if ((exercise.answerOptions?.length ?? 0) >= 6) difficulty++
  return Math.min(5, difficulty)
}

function isPreview(filename) {
  return /^(?:fian|fisi_ap2|wiso)_(?:00[1-9]|010)\.json$/.test(filename)
}

function assignLearningLevel(filename, exercise, difficulty) {
  const categories = exercise.categories ?? []
  if (categories.includes('AP1')) {
    if (
      categories.includes('Computergrundlagen')
      || categories.includes('Netzwerkgrundlagen')
    ) return 1
    if (difficulty === 1) return 2
    if (difficulty === 2) return 3
    return 4
  }
  if (categories.includes('AP2') || categories.includes('WiSo')) {
    if (isPreview(filename)) return 5
    if (difficulty <= 2) return 6
    if (difficulty === 3) return 7
    return 8
  }
  return difficulty <= 2 ? 1 : 9
}

function addMetadata(source, learningLevel, difficulty) {
  const mobileSolvableLine = /(\n\s*"mobileSolvable"\s*:\s*(?:true|false),)/
  if (!mobileSolvableLine.test(source)) {
    throw new Error('mobileSolvable field could not be located')
  }
  return source.replace(
    mobileSolvableLine,
    `$1\n  "learningLevel": ${learningLevel},\n  "difficulty": ${difficulty},`,
  )
}

const distribution = { learningLevel: {}, difficulty: {} }
let changed = 0
const filenames = fs.readdirSync(exerciseDirectory)
  .filter(filename => filename.endsWith('.json') && !filename.startsWith('index'))
  .sort()

for (const filename of filenames) {
  const file = path.join(exerciseDirectory.pathname, filename)
  const source = fs.readFileSync(file, 'utf8')
  const exercise = JSON.parse(source)
  if (!exercise.inputMode) continue
  const hasLevel = Number.isInteger(exercise.learningLevel)
  const hasDifficulty = Number.isInteger(exercise.difficulty)
  if (hasLevel !== hasDifficulty) {
    throw new Error(`${filename} has incomplete learning metadata`)
  }
  const difficulty = hasDifficulty
    ? exercise.difficulty
    : estimateDifficulty(exercise)
  const learningLevel = hasLevel
    ? exercise.learningLevel
    : assignLearningLevel(filename, exercise, difficulty)

  distribution.difficulty[difficulty]
    = (distribution.difficulty[difficulty] ?? 0) + 1
  distribution.learningLevel[learningLevel]
    = (distribution.learningLevel[learningLevel] ?? 0) + 1

  if (!hasLevel && writeChanges) {
    fs.writeFileSync(file, addMetadata(source, learningLevel, difficulty))
    changed++
  }
}

console.log(JSON.stringify({ changed, ...distribution }, null, 2))
