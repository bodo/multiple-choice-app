import { liveQuery, type Subscription } from 'dexie'
import { computed, ref } from 'vue'
import {
  db,
  type StoredAnswerEvent,
  type StoredAnswerLogEntry,
  type StoredExerciseProgress,
  type StoredPracticeSession,
  type StoredStreak,
  type WeakspotReason,
} from '../../db/db'
import type { Exercise } from './exercise'

export type AnswerMode = 'train' | 'exam'
export type ExerciseRecord = StoredExerciseProgress
export type AnswerLogEntry = StoredAnswerLogEntry

export interface RecordAnswerResult {
  becameWeakspot: boolean
  xpEarned: number
}

export interface WeaknessInfo {
  id: string
  accuracy: number
  total: number
  box: number
  avgTimeMs: number
  recentTrend: number
}

export interface OpenWeakspotInfo {
  id: string
  reason: WeakspotReason
  weakspotAt: number
  interventionCount: number
  correct: number
  wrong: number
}

const MAX_LOG_ENTRIES = 20
const WRONG_ANSWER_LIMIT = 4
const WRONG_ANSWER_WINDOW_MS = 24 * 60 * 60 * 1000
const BOX_INTERVALS_HOURS = [0, 0, 4, 24, 72, 168]

const progressRecords = ref<Record<string, ExerciseRecord>>({})
const practiceSessions = ref<StoredPracticeSession[]>([])
const streaks = ref<StoredStreak[]>([])
const answerEvents = ref<StoredAnswerEvent[]>([])
const currentStreak = ref(0)

let progressSubscription: Subscription | undefined
let sessionSubscription: Subscription | undefined
let streakSubscription: Subscription | undefined
let answerEventSubscription: Subscription | undefined
const currentSessionStart = Date.now()
const currentSessionId = createId('session')
let currentSessionQuestions = 0
let currentSessionCorrect = 0

export const openWeakspotCount = computed(() =>
  Object.values(progressRecords.value)
    .filter(record => record.learningStatus === 'interventionRequired').length,
)

export const openWeakspotIds = computed(() => new Set(
  Object.values(progressRecords.value)
    .filter(record => record.learningStatus === 'interventionRequired')
    .map(record => record.exerciseId),
))

function createId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${id}`
}

function defaultRecord(exerciseId: string): ExerciseRecord {
  return {
    exerciseId,
    correct: 0,
    wrong: 0,
    lastSeen: 0,
    box: 1,
    avgTimeMs: 0,
    answerLog: [],
    learningStatus: 'active',
    weakspotReason: null,
    weakspotAt: null,
    interventionCount: 0,
    lastReturnedAt: null,
    xp: 0,
  }
}

function toProgressMap(records: ExerciseRecord[]): Record<string, ExerciseRecord> {
  return Object.fromEntries(records.map(record => [record.exerciseId, record]))
}

function replaceProgressRecord(record: ExerciseRecord) {
  progressRecords.value = { ...progressRecords.value, [record.exerciseId]: record }
}

function replacePracticeSession(session: StoredPracticeSession) {
  const others = practiceSessions.value.filter(entry => entry.id !== session.id)
  practiceSessions.value = [...others, session]
}

function calculateTrailingStreak(
  events: Array<{ correct: boolean }>,
): number {
  let length = 0
  for (let index = events.length - 1; index >= 0; index--) {
    if (!events[index].correct) break
    length++
  }
  return length
}

function subscribeToHistory() {
  progressSubscription?.unsubscribe()
  progressSubscription = liveQuery(() => db.exerciseProgress.toArray()).subscribe({
    next(records) {
      progressRecords.value = toProgressMap(records)
    },
    error(error) {
      console.warn('Exercise progress could not be read from IndexedDB.', error)
    },
  })

  sessionSubscription?.unsubscribe()
  sessionSubscription = liveQuery(() => db.practiceSessions.toArray()).subscribe({
    next(records) {
      practiceSessions.value = records
    },
    error(error) {
      console.warn('Practice sessions could not be read from IndexedDB.', error)
    },
  })

  streakSubscription?.unsubscribe()
  streakSubscription = liveQuery(() => db.streaks.toArray()).subscribe({
    next(records) {
      streaks.value = records
    },
    error(error) {
      console.warn('Streaks could not be read from IndexedDB.', error)
    },
  })

  answerEventSubscription?.unsubscribe()
  answerEventSubscription = liveQuery(
    () => db.answerEvents.orderBy('occurredAt').toArray(),
  ).subscribe({
    next(records) {
      answerEvents.value = records
    },
    error(error) {
      console.warn('Answer events could not be read from IndexedDB.', error)
    },
  })
}

export async function initializeExerciseHistory(): Promise<void> {
  const [progress, storedSessions, storedStreaks, storedAnswerEvents] = await Promise.all([
    db.exerciseProgress.toArray(),
    db.practiceSessions.toArray(),
    db.streaks.toArray(),
    db.answerEvents.orderBy('occurredAt').toArray(),
  ])
  progressRecords.value = toProgressMap(progress)
  practiceSessions.value = storedSessions
  streaks.value = storedStreaks
  answerEvents.value = storedAnswerEvents
  currentStreak.value = calculateTrailingStreak(storedAnswerEvents)
  subscribeToHistory()
  await flagPendingAutomaticWeakspots()
}

function appendAnswer(
  record: ExerciseRecord,
  isCorrect: boolean,
  timeMs: number,
  mode: AnswerMode,
  occurredAt: number,
  xpEarned: number,
): ExerciseRecord {
  const correct = record.correct + (isCorrect ? 1 : 0)
  const wrong = record.wrong + (isCorrect ? 0 : 1)
  const total = correct + wrong
  const avgTimeMs = total <= 1
    ? timeMs
    : Math.round(record.avgTimeMs * 0.8 + timeMs * 0.2)
  const answerLog = [
    ...record.answerLog,
    { date: occurredAt, correct: isCorrect, timeMs, mode },
  ].slice(-MAX_LOG_ENTRIES)

  return {
    ...record,
    correct,
    wrong,
    lastSeen: occurredAt,
    box: isCorrect ? Math.min(record.box + 1, 5) : 1,
    avgTimeMs,
    answerLog,
    xp: record.xp + xpEarned,
  }
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function xpForDifficulty(difficulty: Exercise['difficulty']): number {
  return [0, 1, 2, 3, 5, 8][difficulty] ?? 1
}

function hasRepeatedIncorrectAnswers(record: ExerciseRecord): boolean {
  const epochAnswers = record.answerLog.filter(answer =>
    record.lastReturnedAt === null || answer.date > record.lastReturnedAt)
  const recent = epochAnswers.slice(-WRONG_ANSWER_LIMIT)
  if (
    recent.length < WRONG_ANSWER_LIMIT
    || recent.some(answer => answer.correct)
  ) return false

  return recent[recent.length - 1].date - recent[0].date
    <= WRONG_ANSWER_WINDOW_MS
}

function withWeakspot(
  record: ExerciseRecord,
  reason: WeakspotReason,
  occurredAt: number,
): ExerciseRecord {
  if (record.learningStatus === 'interventionRequired') return record
  return {
    ...record,
    learningStatus: 'interventionRequired',
    weakspotReason: reason,
    weakspotAt: occurredAt,
    interventionCount: record.interventionCount + 1,
  }
}

export async function recordAnswer(
  exercise: Exercise,
  isCorrect: boolean,
  timeMs: number,
  mode: AnswerMode,
): Promise<RecordAnswerResult> {
  const occurredAt = Date.now()
  const previous = await db.exerciseProgress.get(exercise.id)
    ?? defaultRecord(exercise.id)
  const alreadyCorrectToday = isCorrect && await db.answerEvents
    .where('occurredAt')
    .between(startOfLocalDay(occurredAt), occurredAt, true, true)
    .filter(event => event.exerciseId === exercise.id && event.correct)
    .first() !== undefined
  const dailyGoalCredit = isCorrect && !alreadyCorrectToday
  const xpEarned = dailyGoalCredit
    ? xpForDifficulty(exercise.difficulty) + (previous.box >= 2 ? 1 : 0)
    : 0
  let updated = appendAnswer(
    previous,
    isCorrect,
    timeMs,
    mode,
    occurredAt,
    xpEarned,
  )
  const becameWeakspot = mode === 'train'
    && updated.learningStatus === 'active'
    && hasRepeatedIncorrectAnswers(updated)
  if (becameWeakspot) {
    updated = withWeakspot(updated, 'repeatedIncorrect', occurredAt)
  }

  currentSessionQuestions++
  if (isCorrect) currentSessionCorrect++
  const session: StoredPracticeSession = {
    id: currentSessionId,
    date: new Date(currentSessionStart).toISOString(),
    questions: currentSessionQuestions,
    correct: currentSessionCorrect,
    durationMs: Date.now() - currentSessionStart,
  }
  const completedStreak = !isCorrect && currentStreak.value > 0
    ? {
        id: createId('streak'),
        date: new Date(occurredAt).toISOString(),
        length: currentStreak.value,
      }
    : null

  await db.transaction(
    'rw',
    [db.exerciseProgress, db.answerEvents, db.practiceSessions, db.streaks],
    async () => {
      await db.exerciseProgress.put(updated)
      await db.answerEvents.put({
        id: createId('answer'),
        exerciseId: exercise.id,
        correct: isCorrect,
        durationMs: timeMs,
        occurredAt,
        mode,
        sessionId: currentSessionId,
        boxBefore: previous.box,
        boxAfter: updated.box,
        learningLevel: exercise.learningLevel,
        difficulty: exercise.difficulty,
        xpEarned,
        dailyGoalCredit,
      })
      await db.practiceSessions.put(session)
      if (completedStreak) await db.streaks.put(completedStreak)
    },
  )

  replaceProgressRecord(updated)
  replacePracticeSession(session)
  if (completedStreak) streaks.value = [...streaks.value, completedStreak]
  currentStreak.value = isCorrect ? currentStreak.value + 1 : 0
  return { becameWeakspot, xpEarned }
}

export async function markExerciseAsWeakspot(
  exerciseId: string,
  reason: WeakspotReason = 'manual',
): Promise<boolean> {
  const record = await db.exerciseProgress.get(exerciseId)
    ?? defaultRecord(exerciseId)
  if (record.learningStatus === 'interventionRequired') return false

  const updated = withWeakspot(record, reason, Date.now())
  await db.exerciseProgress.put(updated)
  replaceProgressRecord(updated)
  return true
}

export async function returnWeakspotToTraining(
  exerciseId: string,
): Promise<void> {
  const record = await db.exerciseProgress.get(exerciseId)
  if (!record) return
  const updated: ExerciseRecord = {
    ...record,
    box: 1,
    learningStatus: 'active',
    weakspotReason: null,
    weakspotAt: null,
    lastReturnedAt: Date.now(),
  }
  await db.exerciseProgress.put(updated)
  replaceProgressRecord(updated)
}

export async function flagPendingAutomaticWeakspots(): Promise<number> {
  const records = await db.exerciseProgress.toArray()
  const occurredAt = Date.now()
  const pending = records
    .filter(record => record.learningStatus === 'active')
    .filter(hasRepeatedIncorrectAnswers)
    .map(record => withWeakspot(record, 'repeatedIncorrect', occurredAt))
  if (pending.length === 0) return 0

  await db.exerciseProgress.bulkPut(pending)
  for (const record of pending) replaceProgressRecord(record)
  return pending.length
}

export function isExerciseWeakspot(exerciseId: string): boolean {
  return progressRecords.value[exerciseId]?.learningStatus
    === 'interventionRequired'
}

export function getRecord(exerciseId: string): ExerciseRecord {
  return progressRecords.value[exerciseId] ?? defaultRecord(exerciseId)
}

export function getWeight(exerciseId: string): number {
  const record = progressRecords.value[exerciseId]
  if (!record) return 10

  const hoursSince = (Date.now() - record.lastSeen) / 3_600_000
  const interval = BOX_INTERVALS_HOURS[record.box] ?? 168
  if (interval === 0) {
    const total = record.correct + record.wrong
    const errorRate = total > 0 ? record.wrong / total : 0.5
    return 5 + errorRate * 5
  }

  const overdueRatio = hoursSince / interval
  if (overdueRatio >= 1) return Math.min(2 + overdueRatio * 2, 10)
  return 0.1
}

function computeTrend(log: AnswerLogEntry[]): number {
  if (log.length < 4) return 0
  const half = Math.floor(log.length / 2)
  const firstHalf = log.slice(0, half)
  const secondHalf = log.slice(half)
  const firstRate = firstHalf.filter(entry => entry.correct).length / firstHalf.length
  const secondRate = secondHalf.filter(entry => entry.correct).length / secondHalf.length
  return Math.round((secondRate - firstRate) * 100) / 100
}

export function getOpenWeakspots(exerciseIds?: ReadonlySet<string>): OpenWeakspotInfo[] {
  return Object.values(progressRecords.value)
    .filter(record => !exerciseIds || exerciseIds.has(record.exerciseId))
    .filter((record): record is ExerciseRecord & {
      weakspotReason: WeakspotReason
      weakspotAt: number
    } => record.learningStatus === 'interventionRequired'
      && record.weakspotReason !== null
      && record.weakspotAt !== null)
    .map(record => ({
      id: record.exerciseId,
      reason: record.weakspotReason,
      weakspotAt: record.weakspotAt,
      interventionCount: record.interventionCount,
      correct: record.correct,
      wrong: record.wrong,
    }))
    .sort((a, b) => b.weakspotAt - a.weakspotAt)
}

export function getWeakestExercises(
  limit = 5,
  exerciseIds?: ReadonlySet<string>,
): WeaknessInfo[] {
  return Object.values(progressRecords.value)
    .filter(record => !exerciseIds || exerciseIds.has(record.exerciseId))
    .filter(record => record.learningStatus === 'active')
    .flatMap((record) => {
      const total = record.correct + record.wrong
      if (total < 2) return []
      return [{
        id: record.exerciseId,
        accuracy: record.correct / total,
        total,
        box: record.box,
        avgTimeMs: record.avgTimeMs,
        recentTrend: computeTrend(record.answerLog),
      }]
    })
    .sort((a, b) => a.accuracy - b.accuracy || a.box - b.box)
    .slice(0, limit)
}

export function getMasteryDistribution(
  exerciseIds?: ReadonlySet<string>,
): number[] {
  const distribution = [0, 0, 0, 0, 0, 0]
  for (const record of Object.values(progressRecords.value)) {
    if (exerciseIds && !exerciseIds.has(record.exerciseId)) continue
    if (record.learningStatus === 'interventionRequired') {
      distribution[0]++
    } else {
      distribution[record.box]++
    }
  }
  return distribution
}

export function getCategoryAccuracy(
  catalog: Array<{ id: string; categories: string[] }>,
): Array<{ category: string; accuracy: number; total: number }> {
  const categoryStats: Record<string, { correct: number; total: number }> = {}
  for (const entry of catalog) {
    const record = progressRecords.value[entry.id]
    if (!record) continue
    const total = record.correct + record.wrong
    if (total === 0) continue
    for (const category of entry.categories) {
      categoryStats[category] ??= { correct: 0, total: 0 }
      categoryStats[category].correct += record.correct
      categoryStats[category].total += total
    }
  }
  return Object.entries(categoryStats)
    .map(([category, stats]) => ({
      category,
      accuracy: Math.round((stats.correct / stats.total) * 100),
      total: stats.total,
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
}

const RANKS = [
  { title: 'Beginner', minXp: 0 },
  { title: 'Apprentice', minXp: 20 },
  { title: 'Student', minXp: 60 },
  { title: 'Scholar', minXp: 150 },
  { title: 'Expert', minXp: 300 },
  { title: 'Specialist', minXp: 500 },
  { title: 'Master', minXp: 800 },
  { title: 'Grand Master', minXp: 1200 },
  { title: 'Champion', minXp: 1800 },
  { title: 'Legend', minXp: 2500 },
]

export function getRank(exerciseIds?: ReadonlySet<string>) {
  let xp = 0
  for (const record of Object.values(progressRecords.value)) {
    if (exerciseIds && !exerciseIds.has(record.exerciseId)) continue
    xp += record.xp
  }
  xp = Math.round(xp)

  let level = 1
  let nextLevelXp = RANKS[1]?.minXp ?? 999999
  for (let index = RANKS.length - 1; index >= 0; index--) {
    if (xp >= RANKS[index].minXp) {
      level = index + 1
      nextLevelXp = RANKS[index + 1]?.minXp ?? RANKS[index].minXp
      break
    }
  }
  return { title: RANKS[level - 1].title, level, xp, nextLevelXp }
}

function scopedEvents(exerciseIds?: ReadonlySet<string>): StoredAnswerEvent[] {
  return exerciseIds
    ? answerEvents.value.filter(event => exerciseIds.has(event.exerciseId))
    : answerEvents.value
}

function streakLengthsForEvents(events: StoredAnswerEvent[]): number[] {
  const lengths: number[] = []
  let length = 0
  for (const event of events) {
    if (event.correct) {
      length++
    } else if (length > 0) {
      lengths.push(length)
      length = 0
    }
  }
  if (length > 0) lengths.push(length)
  return lengths
}

export function getCurrentStreak(exerciseIds?: ReadonlySet<string>): number {
  return calculateTrailingStreak(scopedEvents(exerciseIds))
}

export function getLongestStreak(exerciseIds?: ReadonlySet<string>): number {
  return Math.max(...streakLengthsForEvents(scopedEvents(exerciseIds)), 0)
}

export function getStats(exerciseIds?: ReadonlySet<string>) {
  const events = scopedEvents(exerciseIds)
  const totalQuestions = events.length
  const totalCorrect = events.filter(event => event.correct).length
  const totalDurationMs = events.reduce(
    (sum, event) => sum + event.durationMs,
    0,
  )
  const streakLengths = streakLengthsForEvents(events)
  const sessionIds = new Set(events.map(event =>
    event.sessionId ?? `legacy-${new Date(event.occurredAt).toISOString().slice(0, 10)}`))

  return {
    totalQuestions,
    totalCorrect,
    totalAccuracy: totalQuestions > 0
      ? Math.round((totalCorrect / totalQuestions) * 100)
      : 0,
    totalDurationMs,
    totalSessions: sessionIds.size,
    uniqueDays: new Set(
      events.map(event => new Date(event.occurredAt).toISOString().slice(0, 10)),
    ).size,
    currentStreak: calculateTrailingStreak(events),
    longestStreak: Math.max(...streakLengths, 0),
    shortestStreak: streakLengths.length > 0 ? Math.min(...streakLengths) : 0,
    averageStreak: streakLengths.length > 0
      ? Math.round(
          streakLengths.reduce((sum, length) => sum + length, 0)
          / streakLengths.length * 10,
        ) / 10
      : 0,
    totalStreaks: streakLengths.length,
  }
}
