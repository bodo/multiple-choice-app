import { liveQuery, type Subscription } from 'dexie'
import { computed, ref } from 'vue'
import {
  db,
  type StoredAnswerEvent,
  type StoredAnswerLogEntry,
  type StoredExerciseProgress,
  type StoredPracticeSession,
  type StoredStreak,
  type StoredXpLedgerEntry,
  type WeakspotReason,
} from '../../db/db'
import type { AnswerResult, Exercise } from './exercise'
import {
  isSuccessfulOutcome,
  normalizeScorePermille,
  outcomeForScore,
  type AnswerOutcome,
} from './answerOutcome'
import {
  getSessionCardSelectionState,
  type SessionCardSelectionState,
} from './services/trainingExerciseSelectionService'

export type AnswerMode = 'train' | 'exam'
export type ExerciseRecord = StoredExerciseProgress
export type AnswerLogEntry = StoredAnswerLogEntry

export interface RecordAnswerResult {
  becameWeakspot: boolean
  xpEarned: number
  masteryXpEarned: number
  momentumXpEarned: number
  outcome: AnswerOutcome
  scorePermille: number
  milestone: SessionMilestone | null
}

export type SessionMilestone = 3 | 20 | 50

export interface XpSummary {
  mastery: number
  momentum: number
  total: number
}

export interface LearningRhythm {
  observedDays: number
  qualifiedSessions: number
  sessionsPerWeek: number
  sessionsPerCalendarDay: number
  sessionsPerActiveDay: number
  activeDaysPerWeek: number
  longestActiveRun: number
  longestPause: number
  evenness: number | null
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
const SESSION_IDLE_TIMEOUT_MS = 25 * 60 * 1000
const SESSION_MIN_ANSWERS = 3
const SESSION_MIN_ACTIVE_MS = 2 * 60 * 1000
const MAX_CREDITED_ANSWER_MS = 2 * 60 * 1000
const MAX_BONUS_SESSIONS_PER_DAY = 4
const XP_SCALE = 1000
const XP_POLICY_VERSION = 1
const RHYTHM_WINDOW_DAYS = 28

const progressRecords = ref<Record<string, ExerciseRecord>>({})
const practiceSessions = ref<StoredPracticeSession[]>([])
const streaks = ref<StoredStreak[]>([])
const answerEvents = ref<StoredAnswerEvent[]>([])
const xpLedgerEntries = ref<StoredXpLedgerEntry[]>([])

let progressSubscription: Subscription | undefined
let sessionSubscription: Subscription | undefined
let streakSubscription: Subscription | undefined
let answerEventSubscription: Subscription | undefined
let xpLedgerSubscription: Subscription | undefined

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
    partial: 0,
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

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localDayStart(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function nextLocalDayStart(timestamp: number): number {
  const date = new Date(localDayStart(timestamp))
  date.setDate(date.getDate() + 1)
  return date.getTime()
}

function addLocalDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return localDateKey(date.getTime())
}

function answerOutcome(event: Pick<StoredAnswerEvent, 'correct' | 'outcome' | 'scorePermille'>): AnswerOutcome {
  if (event.outcome) return event.outcome
  return outcomeForScore(normalizeScorePermille(event.scorePermille, event.correct))
}

function answerScore(event: Pick<StoredAnswerEvent, 'correct' | 'scorePermille'>): number {
  return normalizeScorePermille(event.scorePermille, event.correct)
}

function isSuccessfulEvent(event: Pick<StoredAnswerEvent, 'correct' | 'outcome' | 'scorePermille'>): boolean {
  return isSuccessfulOutcome(answerOutcome(event))
}

function sessionKeyForEvent(event: StoredAnswerEvent): string {
  return event.sessionId ?? `legacy-${localDateKey(event.occurredAt)}`
}

function isOpenSession(session: StoredPracticeSession): boolean {
  return session.endedAt === undefined && typeof session.lastActivityAt === 'number'
}

function isSessionExpired(session: StoredPracticeSession, now: number): boolean {
  return !isOpenSession(session)
    || now - (session.lastActivityAt ?? 0) >= SESSION_IDLE_TIMEOUT_MS
}

function getActiveSession(now: number): StoredPracticeSession | null {
  return practiceSessions.value
    .filter(session => !isSessionExpired(session, now))
    .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0))[0]
    ?? null
}

function createSession(occurredAt: number): StoredPracticeSession {
  return {
    id: createId('session'),
    date: new Date(occurredAt).toISOString(),
    questions: 0,
    correct: 0,
    partial: 0,
    incorrect: 0,
    durationMs: 0,
    startedAt: occurredAt,
    lastActivityAt: occurredAt,
    activeDurationMs: 0,
    shownMilestones: [],
    policyVersion: XP_POLICY_VERSION,
  }
}

function sessionMilestone(answerIndex: number, session: StoredPracticeSession): SessionMilestone | null {
  const shown = new Set(session.shownMilestones ?? [])
  if ((answerIndex === 3 || answerIndex === 20 || answerIndex === 50) && !shown.has(answerIndex)) {
    return answerIndex
  }
  return null
}

function multiplierForSession(session: StoredPracticeSession, answerIndex: number): number {
  if (
    !session.qualifiedAt
    || (session.bonusSessionOrdinal ?? Infinity) > MAX_BONUS_SESSIONS_PER_DAY
  ) return 1
  if (answerIndex >= 4 && answerIndex <= 10) return 1.25
  if (answerIndex >= 11 && answerIndex <= 30) return 1.1
  return 1
}

function updateSession(
  session: StoredPracticeSession,
  outcome: AnswerOutcome,
  activeDurationMs: number,
  occurredAt: number,
  bonusSessionOrdinal: number,
): { session: StoredPracticeSession; milestone: SessionMilestone | null } {
  const questions = session.questions + 1
  const correct = session.correct + (outcome === 'correct' ? 1 : 0)
  const partial = (session.partial ?? 0) + (outcome === 'partial' ? 1 : 0)
  const incorrect = (session.incorrect ?? 0) + (outcome === 'incorrect' ? 1 : 0)
  const creditedActiveDurationMs = Math.min(
    Math.max(activeDurationMs, 0),
    MAX_CREDITED_ANSWER_MS,
  )
  const nextActiveDurationMs = (session.activeDurationMs ?? 0) + creditedActiveDurationMs
  const newlyQualified = !session.qualifiedAt
    && questions >= SESSION_MIN_ANSWERS
    && nextActiveDurationMs >= SESSION_MIN_ACTIVE_MS
  const answerIndex = questions
  const milestone = sessionMilestone(answerIndex, session)
  const shownMilestones = milestone
    ? [...(session.shownMilestones ?? []), milestone]
    : session.shownMilestones ?? []

  return {
    milestone,
    session: {
      ...session,
      questions,
      correct,
      partial,
      incorrect,
      durationMs: occurredAt - (session.startedAt ?? occurredAt),
      lastActivityAt: occurredAt,
      activeDurationMs: nextActiveDurationMs,
      qualifiedAt: newlyQualified ? occurredAt : session.qualifiedAt,
      qualificationLocalDate: newlyQualified
        ? localDateKey(occurredAt)
        : session.qualificationLocalDate,
      bonusSessionOrdinal: newlyQualified
        ? bonusSessionOrdinal
        : session.bonusSessionOrdinal,
      shownMilestones,
      policyVersion: XP_POLICY_VERSION,
    },
  }
}

function trailingStreakForEvents(events: StoredAnswerEvent[]): StoredAnswerEvent[] {
  const sorted = [...events].sort((a, b) => a.occurredAt - b.occurredAt)
  const streak: StoredAnswerEvent[] = []
  const last = sorted.at(-1)
  if (!last) return streak
  const sessionKey = sessionKeyForEvent(last)
  for (let index = sorted.length - 1; index >= 0; index--) {
    const event = sorted[index]
    if (sessionKeyForEvent(event) !== sessionKey || !isSuccessfulEvent(event)) break
    streak.unshift(event)
  }
  return streak
}

function completedStreakForEvents(
  events: StoredAnswerEvent[],
  sessionId: string,
  endedAt: number,
  completedReason: StoredStreak['completedReason'],
): StoredStreak | null {
  const trailing = trailingStreakForEvents(events)
  if (trailing.length < 2) return null
  return {
    id: createId('streak'),
    date: new Date(endedAt).toISOString(),
    length: trailing.length,
    correctCount: trailing.filter(event => answerOutcome(event) === 'correct').length,
    partialCount: trailing.filter(event => answerOutcome(event) === 'partial').length,
    startedAt: trailing[0].occurredAt,
    endedAt,
    sessionId,
    completedReason,
  }
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

  xpLedgerSubscription?.unsubscribe()
  xpLedgerSubscription = liveQuery(
    () => db.xpLedger.orderBy('occurredAt').toArray(),
  ).subscribe({
    next(records) {
      xpLedgerEntries.value = records
    },
    error(error) {
      console.warn('XP ledger could not be read from IndexedDB.', error)
    },
  })
}

export async function initializeExerciseHistory(): Promise<void> {
  await ensureLegacyXpLedger()
  const [progress, storedSessions, storedStreaks, storedAnswerEvents, storedXpLedger] = await Promise.all([
    db.exerciseProgress.toArray(),
    db.practiceSessions.toArray(),
    db.streaks.toArray(),
    db.answerEvents.orderBy('occurredAt').toArray(),
    db.xpLedger.orderBy('occurredAt').toArray(),
  ])
  progressRecords.value = toProgressMap(progress)
  practiceSessions.value = storedSessions
  streaks.value = storedStreaks
  answerEvents.value = storedAnswerEvents
  xpLedgerEntries.value = storedXpLedger
  await applyDueXpDecay()
  subscribeToHistory()
  await flagPendingAutomaticWeakspots()
}

import type { ConfidenceLevel, ErrorSelfTag, MetacognitiveState } from './exercise'

function computeMetacognitiveState(
  outcome: AnswerOutcome,
  confidence?: ConfidenceLevel,
): MetacognitiveState | undefined {
  if (!confidence) return undefined
  if (confidence === 'high' && outcome === 'incorrect') return 'overconfident'
  if (confidence === 'medium' && outcome === 'correct') return 'underconfident'
  return 'calibrated'
}

function computeBox(
  previousBox: number,
  outcome: AnswerOutcome,
  confidence?: ConfidenceLevel,
): number {
  if (outcome === 'correct') {
    if (confidence === 'medium') {
      return Math.min(previousBox, 2)
    }
    return Math.min(previousBox + 1, 5)
  }
  if (outcome === 'incorrect') {
    return 1
  }
  return previousBox
}

export function getTrainingSessionCardSelectionState(
  exerciseId: string,
  now = Date.now(),
): SessionCardSelectionState {
  const session = getActiveSession(now)
  if (!session) {
    return { lastOutcome: null, lastConfidence: null, distinctCardsSinceLastAnswer: 0 }
  }

  const sessionAnswers = answerEvents.value
    .filter(event => event.sessionId === session.id)
    .sort((a, b) =>
      (a.sessionAnswerIndex ?? 0) - (b.sessionAnswerIndex ?? 0)
      || a.occurredAt - b.occurredAt)
    .map(event => ({
      exerciseId: event.exerciseId,
      outcome: answerOutcome(event),
      confidence: event.confidence,
    }))
  return getSessionCardSelectionState(exerciseId, sessionAnswers)
}

function appendAnswer(
  record: ExerciseRecord,
  outcome: AnswerOutcome,
  scorePermille: number,
  timeMs: number,
  mode: AnswerMode,
  occurredAt: number,
  xpEarnedMilli: number,
  result?: AnswerResult,
): ExerciseRecord {
  const correct = record.correct + (outcome === 'correct' ? 1 : 0)
  const wrong = record.wrong + (outcome === 'incorrect' ? 1 : 0)
  const partial = (record.partial ?? 0) + (outcome === 'partial' ? 1 : 0)
  const total = correct + wrong + partial
  const avgTimeMs = total <= 1
    ? timeMs
    : Math.round(record.avgTimeMs * 0.8 + timeMs * 0.2)
  const metacognitiveState = computeMetacognitiveState(outcome, result?.confidence)
  const answerLog = [
    ...record.answerLog,
    {
      date: occurredAt,
      correct: outcome === 'correct',
      timeMs,
      mode,
      scorePermille,
      outcome,
      confidence: result?.confidence,
      metacognitiveState,
      timeToRevealMs: result?.timeToRevealMs,
      timeToSubmitMs: result?.timeToSubmitMs,
      optionChangeCount: result?.optionChangeCount,
      optionsCoveredMode: result?.optionsCoveredMode,
      firstSelectedIdx: result?.firstSelectedIdx,
      finalSelectedIdx: result?.finalSelectedIdx,
    },
  ].slice(-MAX_LOG_ENTRIES)

  return {
    ...record,
    correct,
    wrong,
    partial,
    lastSeen: occurredAt,
    box: computeBox(record.box, outcome, result?.confidence),
    avgTimeMs,
    answerLog,
    xp: record.xp + xpEarnedMilli / XP_SCALE,
  }
}

function xpForDifficulty(difficulty: Exercise['difficulty']): number {
  return [0, 1, 2, 3, 5, 8][difficulty] ?? 1
}

function answerLogOutcome(entry: AnswerLogEntry): AnswerOutcome {
  if (entry.outcome) return entry.outcome
  return outcomeForScore(normalizeScorePermille(entry.scorePermille, entry.correct))
}

function hasRepeatedIncorrectAnswers(record: ExerciseRecord): boolean {
  const epochAnswers = record.answerLog.filter(answer =>
    record.lastReturnedAt === null || answer.date > record.lastReturnedAt)
  const recent = epochAnswers.slice(-WRONG_ANSWER_LIMIT)
  if (
    recent.length < WRONG_ANSWER_LIMIT
    || recent.some(answer => answerLogOutcome(answer) !== 'incorrect')
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

function bestCreditedScoreToday(events: StoredAnswerEvent[]): number {
  return Math.max(
    0,
    ...events.map(event => answerOutcome(event) === 'incorrect' ? 0 : answerScore(event)),
  )
}

function localDateForSession(session: StoredPracticeSession): string | null {
  if (session.qualificationLocalDate) return session.qualificationLocalDate
  return typeof session.qualifiedAt === 'number'
    ? localDateKey(session.qualifiedAt)
    : null
}

async function ensureLegacyXpLedger(): Promise<void> {
  await db.transaction('rw', [db.exerciseProgress, db.xpLedger], async () => {
    const [progress, ledger] = await Promise.all([
      db.exerciseProgress.toArray(),
      db.xpLedger.toArray(),
    ])
    const existingKeys = new Set(ledger.map(entry => entry.idempotencyKey))
    const missingEntries = progress.flatMap((record) => {
      const amountMilli = Math.round((record.xp ?? 0) * XP_SCALE)
      const idempotencyKey = `legacy-xp:${record.exerciseId}`
      if (amountMilli <= 0 || existingKeys.has(idempotencyKey)) return []
      const occurredAt = record.lastSeen > 0 ? record.lastSeen : Date.now()
      return [{
        id: `xp-${idempotencyKey}`,
        idempotencyKey,
        occurredAt,
        localDate: localDateKey(occurredAt),
        amountMilli,
        bucket: 'mastery' as const,
        reason: 'legacyMigration' as const,
        exerciseId: record.exerciseId,
        policyVersion: XP_POLICY_VERSION,
      }]
    })
    if (missingEntries.length > 0) await db.xpLedger.bulkPut(missingEntries)
  })
}

function pendingDecayEntries(
  now: number,
  sessions: StoredPracticeSession[],
  ledger: StoredXpLedgerEntry[],
): StoredXpLedgerEntry[] {
  const activeDates = new Set(sessions.flatMap((session) => {
    const date = localDateForSession(session)
    return date ? [date] : []
  }))
  const firstActiveDate = [...activeDates].sort()[0]
  if (!firstActiveDate) return []

  const today = localDateKey(now)
  const existingKeys = new Set(ledger.map(entry => entry.idempotencyKey))
  const pending: StoredXpLedgerEntry[] = []
  let momentumMilli = ledger
    .filter(entry => entry.bucket === 'momentum')
    .reduce((sum, entry) => sum + entry.amountMilli, 0)

  for (
    let day = addLocalDays(firstActiveDate, 1);
    day <= today;
    day = addLocalDays(day, 1)
  ) {
    if (
      activeDates.has(day)
      || activeDates.has(addLocalDays(day, -1))
      || activeDates.has(addLocalDays(day, -2))
    ) continue

    const idempotencyKey = `xp-decay:${day}:v${XP_POLICY_VERSION}`
    if (existingKeys.has(idempotencyKey)) continue

    const periodStart = addLocalDays(day, -RHYTHM_WINDOW_DAYS)
    const earnedMilli = [...ledger, ...pending]
      .filter(entry =>
        entry.localDate >= periodStart
        && entry.localDate < day
        && (entry.reason === 'answerBase' || entry.reason === 'sessionBonus')
        && entry.amountMilli > 0)
      .reduce((sum, entry) => sum + entry.amountMilli, 0)
    const requestedDecayMilli = Math.round(earnedMilli / RHYTHM_WINDOW_DAYS * 0.5)
    const amountMilli = -Math.min(requestedDecayMilli, Math.max(0, momentumMilli))
    if (amountMilli === 0) continue

    const occurredAt = localDayStart(new Date(`${day}T12:00:00`).getTime())
    const entry: StoredXpLedgerEntry = {
      id: createId('xp'),
      idempotencyKey,
      occurredAt,
      localDate: day,
      amountMilli,
      bucket: 'momentum',
      reason: 'inactivityDecay',
      policyVersion: XP_POLICY_VERSION,
    }
    pending.push(entry)
    momentumMilli += amountMilli
  }

  return pending
}

export async function applyDueXpDecay(now = Date.now()): Promise<void> {
  let added: StoredXpLedgerEntry[] = []
  await db.transaction('rw', [db.practiceSessions, db.xpLedger], async () => {
    const [sessions, ledger] = await Promise.all([
      db.practiceSessions.toArray(),
      db.xpLedger.toArray(),
    ])
    added = pendingDecayEntries(now, sessions, ledger)
    if (added.length > 0) await db.xpLedger.bulkPut(added)
  })
  if (added.length > 0) {
    xpLedgerEntries.value = [...xpLedgerEntries.value, ...added]
  }
}

export async function recordAnswer(
  exercise: Exercise,
  result: AnswerResult,
  timeMs: number,
  activeDurationMs: number,
  mode: AnswerMode,
): Promise<RecordAnswerResult> {
  const occurredAt = Date.now()
  const scorePermille = normalizeScorePermille(result.scorePermille, result.isCorrect)
  const outcome = outcomeForScore(scorePermille)
  let updated = defaultRecord(exercise.id)
  let session = createSession(occurredAt)
  let becameWeakspot = false
  let dailyGoalCredit = false
  let masteryXpMilli = 0
  let momentumXpMilli = 0
  let milestone: SessionMilestone | null = null
  const completedStreaks: StoredStreak[] = []
  let decayEntries: StoredXpLedgerEntry[] = []
  let ledgerEntries: StoredXpLedgerEntry[] = []
  await db.transaction(
    'rw',
    [
      db.exerciseProgress,
      db.answerEvents,
      db.practiceSessions,
      db.streaks,
      db.xpLedger,
    ],
    async () => {
      const previous = await db.exerciseProgress.get(exercise.id)
        ?? defaultRecord(exercise.id)
      const dayStart = localDayStart(occurredAt)
      const dayEnd = nextLocalDayStart(occurredAt)
      const [todayEvents, sessions, ledger] = await Promise.all([
        db.answerEvents
          .where('occurredAt')
          .between(dayStart, dayEnd, true, false)
          .filter(event => event.exerciseId === exercise.id)
          .toArray(),
        db.practiceSessions.toArray(),
        db.xpLedger.toArray(),
      ])
      decayEntries = pendingDecayEntries(occurredAt, sessions, ledger)

      const openSessions = sessions
        .filter(isOpenSession)
        .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0))
      const current = openSessions[0]
      if (current && !isSessionExpired(current, occurredAt)) {
        session = current
      } else {
        if (current) {
          const closed = { ...current, endedAt: current.lastActivityAt }
          const previousSessionEvents = await db.answerEvents
            .where('sessionId')
            .equals(current.id)
            .toArray()
          const completed = completedStreakForEvents(
            previousSessionEvents,
            current.id,
            current.lastActivityAt ?? occurredAt,
            'sessionTimeout',
          )
          if (completed) completedStreaks.push(completed)
          await db.practiceSessions.put(closed)
        }
        session = createSession(occurredAt)
      }

      const qualifyingSessionsToday = sessions.filter((candidate) =>
        candidate.id !== session.id
        && localDateForSession(candidate) === localDateKey(occurredAt)).length
      const sessionUpdate = updateSession(
        session,
        outcome,
        activeDurationMs,
        occurredAt,
        qualifyingSessionsToday + 1,
      )
      session = sessionUpdate.session
      milestone = sessionUpdate.milestone

      const creditedScorePermille = outcome === 'incorrect' ? 0 : scorePermille
      const scoreDeltaPermille = Math.max(
        0,
        creditedScorePermille - bestCreditedScoreToday(todayEvents),
      )
      const baseXp = xpForDifficulty(exercise.difficulty) + (previous.box >= 2 ? 1 : 0)
      masteryXpMilli = baseXp * scoreDeltaPermille
      momentumXpMilli = Math.round(
        masteryXpMilli * (multiplierForSession(session, session.questions) - 1),
      )
      dailyGoalCredit = outcome === 'correct'
        && !todayEvents.some(event => event.correct && event.dailyGoalCredit !== false)

      const metacognitiveState = computeMetacognitiveState(outcome, result.confidence)

      updated = appendAnswer(
        previous,
        outcome,
        scorePermille,
        timeMs,
        mode,
        occurredAt,
        masteryXpMilli + momentumXpMilli,
        result,
      )
      becameWeakspot = mode === 'train'
        && updated.learningStatus === 'active'
        && hasRepeatedIncorrectAnswers(updated)
      if (becameWeakspot) {
        updated = withWeakspot(updated, 'repeatedIncorrect', occurredAt)
      }

      const answerId = createId('answer')
      const currentSessionEvents = await db.answerEvents
        .where('sessionId')
        .equals(session.id)
        .toArray()
      if (outcome === 'incorrect') {
        const completed = completedStreakForEvents(
          currentSessionEvents,
          session.id,
          occurredAt,
          'incorrect',
        )
        if (completed) completedStreaks.push(completed)
      }
      ledgerEntries = [
        ...decayEntries,
        ...(masteryXpMilli > 0 ? [{
          id: createId('xp'),
          idempotencyKey: `xp-answer-base:${answerId}`,
          occurredAt,
          localDate: localDateKey(occurredAt),
          amountMilli: masteryXpMilli,
          bucket: 'mastery' as const,
          reason: 'answerBase' as const,
          exerciseId: exercise.id,
          answerEventId: answerId,
          sessionId: session.id,
          policyVersion: XP_POLICY_VERSION,
        }] : []),
        ...(momentumXpMilli > 0 ? [{
          id: createId('xp'),
          idempotencyKey: `xp-session-bonus:${answerId}`,
          occurredAt,
          localDate: localDateKey(occurredAt),
          amountMilli: momentumXpMilli,
          bucket: 'momentum' as const,
          reason: 'sessionBonus' as const,
          exerciseId: exercise.id,
          answerEventId: answerId,
          sessionId: session.id,
          policyVersion: XP_POLICY_VERSION,
        }] : []),
      ]

      await db.exerciseProgress.put(updated)
      await db.answerEvents.put({
        id: answerId,
        exerciseId: exercise.id,
        correct: outcome === 'correct',
        durationMs: timeMs,
        activeDurationMs: Math.min(Math.max(activeDurationMs, 0), MAX_CREDITED_ANSWER_MS),
        occurredAt,
        mode,
        sessionId: session.id,
        sessionAnswerIndex: session.questions,
        boxBefore: previous.box,
        boxAfter: updated.box,
        learningLevel: exercise.learningLevel,
        difficulty: exercise.difficulty,
        scorePermille,
        outcome,
        confidence: result.confidence,
        metacognitiveState,
        timeToRevealMs: result.timeToRevealMs,
        timeToSubmitMs: result.timeToSubmitMs,
        optionChangeCount: result.optionChangeCount,
        optionsCoveredMode: result.optionsCoveredMode,
        firstSelectedIdx: result.firstSelectedIdx,
        finalSelectedIdx: result.finalSelectedIdx,
        masteryXpMilli,
        momentumXpMilli,
        policyVersion: XP_POLICY_VERSION,
        xpEarned: (masteryXpMilli + momentumXpMilli) / XP_SCALE,
        dailyGoalCredit,
      })
      await db.practiceSessions.put(session)
      if (completedStreaks.length > 0) await db.streaks.bulkPut(completedStreaks)
      if (ledgerEntries.length > 0) await db.xpLedger.bulkPut(ledgerEntries)
    },
  )

  replaceProgressRecord(updated)
  replacePracticeSession(session)
  const storedSessionEvents = await db.answerEvents
    .where('sessionId')
    .equals(session.id)
    .toArray()
  answerEvents.value = [
    ...answerEvents.value.filter(event => event.sessionId !== session.id),
    ...storedSessionEvents,
  ].sort((a, b) => a.occurredAt - b.occurredAt)
  if (completedStreaks.length > 0) streaks.value = [...streaks.value, ...completedStreaks]
  if (ledgerEntries.length > 0) xpLedgerEntries.value = [...xpLedgerEntries.value, ...ledgerEntries]
  return {
    becameWeakspot,
    xpEarned: (masteryXpMilli + momentumXpMilli) / XP_SCALE,
    masteryXpEarned: masteryXpMilli / XP_SCALE,
    momentumXpEarned: momentumXpMilli / XP_SCALE,
    outcome,
    scorePermille,
    milestone,
  }
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

function getExerciseWeight(exerciseId: string, notDueWeight: number): number {
  const record = progressRecords.value[exerciseId]
  if (!record) return 10

  const hoursSince = (Date.now() - record.lastSeen) / 3_600_000
  const interval = BOX_INTERVALS_HOURS[record.box] ?? 168
  if (interval === 0) {
    const total = record.correct + record.wrong + (record.partial ?? 0)
    const errorRate = total > 0 ? record.wrong / total : 0.5
    return 5 + errorRate * 5
  }

  const overdueRatio = hoursSince / interval
  if (overdueRatio >= 1) return Math.min(2 + overdueRatio * 2, 10)
  return notDueWeight
}

export function getWeight(exerciseId: string): number {
  return getExerciseWeight(exerciseId, 0.1)
}

export function getDueWeight(exerciseId: string): number {
  return getExerciseWeight(exerciseId, 0)
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
      const total = record.correct + record.wrong + (record.partial ?? 0)
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
    const total = record.correct + record.wrong + (record.partial ?? 0)
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

function roundedXp(valueMilli: number): number {
  return Math.round(valueMilli / 100) / 10
}

export function getXpSummary(exerciseIds?: ReadonlySet<string>): XpSummary {
  const eligibleEntries = xpLedgerEntries.value.filter((entry) =>
    !exerciseIds || (entry.exerciseId !== undefined && exerciseIds.has(entry.exerciseId)))
  const masteryMilli = eligibleEntries
    .filter(entry => entry.bucket === 'mastery')
    .reduce((sum, entry) => sum + entry.amountMilli, 0)
  const momentumMilli = eligibleEntries
    .filter(entry => entry.bucket === 'momentum')
    .reduce((sum, entry) => sum + entry.amountMilli, 0)
  return {
    mastery: roundedXp(masteryMilli),
    momentum: roundedXp(momentumMilli),
    total: roundedXp(masteryMilli + momentumMilli),
  }
}

export function getRank(exerciseIds?: ReadonlySet<string>) {
  const xp = getXpSummary(exerciseIds).total

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
  let currentSessionKey: string | null = null
  for (const event of [...events].sort((a, b) => a.occurredAt - b.occurredAt)) {
    const sessionKey = sessionKeyForEvent(event)
    if (currentSessionKey !== null && sessionKey !== currentSessionKey && length > 0) {
      lengths.push(length)
      length = 0
    }
    currentSessionKey = sessionKey
    if (isSuccessfulEvent(event)) {
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
  const events = scopedEvents(exerciseIds)
  const last = [...events].sort((a, b) => a.occurredAt - b.occurredAt).at(-1)
  if (!last?.sessionId) return 0
  const session = practiceSessions.value.find(entry => entry.id === last.sessionId)
  if (!session || isSessionExpired(session, Date.now())) return 0
  return trailingStreakForEvents(events).length
}

export function getLongestStreak(exerciseIds?: ReadonlySet<string>): number {
  return Math.max(...streakLengthsForEvents(scopedEvents(exerciseIds)), 0)
}

export function getStats(exerciseIds?: ReadonlySet<string>) {
  const events = scopedEvents(exerciseIds)
  const totalQuestions = events.length
  const totalCorrect = events.filter(event => event.correct).length
  const totalPartial = events.filter(event => answerOutcome(event) === 'partial').length
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
    totalPartial,
    totalAccuracy: totalQuestions > 0
      ? Math.round((totalCorrect / totalQuestions) * 100)
      : 0,
    totalDurationMs,
    totalSessions: sessionIds.size,
    uniqueDays: new Set(
      events.map(event => localDateKey(event.occurredAt)),
    ).size,
    currentStreak: getCurrentStreak(exerciseIds),
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

export function getLearningRhythm(now = Date.now()): LearningRhythm {
  const today = localDateKey(now)
  const windowStart = addLocalDays(today, -(RHYTHM_WINDOW_DAYS - 1))
  const qualifiedSessions = practiceSessions.value.filter((session) => {
    const date = localDateForSession(session)
    return date !== null && date >= windowStart && date <= today
  })
  const activeDates = new Set(qualifiedSessions.flatMap((session) => {
    const date = localDateForSession(session)
    return date ? [date] : []
  }))
  const weekdaySessions = Array.from({ length: 7 }, () => 0)
  for (const session of qualifiedSessions) {
    const qualifiedAt = session.qualifiedAt
    if (qualifiedAt === undefined) continue
    weekdaySessions[new Date(qualifiedAt).getDay()]++
  }

  let longestActiveRun = 0
  let longestPause = 0
  let activeRun = 0
  let pauseRun = 0
  for (let index = 0; index < RHYTHM_WINDOW_DAYS; index++) {
    const day = addLocalDays(windowStart, index)
    if (activeDates.has(day)) {
      activeRun++
      pauseRun = 0
      longestActiveRun = Math.max(longestActiveRun, activeRun)
    } else {
      pauseRun++
      activeRun = 0
      longestPause = Math.max(longestPause, pauseRun)
    }
  }

  const total = qualifiedSessions.length
  const evenness = total < 3
    ? null
    : Math.round(-weekdaySessions
      .filter(value => value > 0)
      .reduce((sum, value) => {
        const probability = value / total
        return sum + probability * Math.log(probability)
      }, 0) / Math.log(7) * 100)
  const activeDays = activeDates.size
  const firstObservedDate = [...activeDates].sort()[0]
  const observedDays = firstObservedDate
    ? Math.min(
        RHYTHM_WINDOW_DAYS,
        Math.round((localDayStart(now) - localDayStart(
          new Date(`${firstObservedDate}T12:00:00`).getTime(),
        )) / (24 * 60 * 60 * 1000)) + 1,
      )
    : 0
  return {
    observedDays,
    qualifiedSessions: total,
    sessionsPerWeek: Math.round(total / 4 * 10) / 10,
    sessionsPerCalendarDay: Math.round(total / RHYTHM_WINDOW_DAYS * 10) / 10,
    sessionsPerActiveDay: activeDays === 0 ? 0 : Math.round(total / activeDays * 10) / 10,
    activeDaysPerWeek: Math.round(activeDays / 4 * 10) / 10,
    longestActiveRun,
    longestPause,
    evenness,
  }
}

export async function updateLastAnswerExplanationTime(
  timeOnExplanationMs: number,
): Promise<void> {
  const lastEvent = answerEvents.value.at(-1)
  if (!lastEvent || timeOnExplanationMs <= 0) return

  const updatedEvent = { ...lastEvent, timeOnExplanationMs }
  await db.answerEvents.put(updatedEvent)

  const progress = progressRecords.value[lastEvent.exerciseId]
  if (progress && progress.answerLog.length > 0) {
    const lastLogIdx = progress.answerLog.length - 1
    const updatedLog = [...progress.answerLog]
    updatedLog[lastLogIdx] = { ...updatedLog[lastLogIdx], timeOnExplanationMs }
    const updatedRecord = { ...progress, answerLog: updatedLog }
    await db.exerciseProgress.put(updatedRecord)
    replaceProgressRecord(updatedRecord)
  }

  const idx = answerEvents.value.length - 1
  answerEvents.value[idx] = updatedEvent
}

export async function updateLastAnswerErrorSelfTag(
  errorSelfTag: ErrorSelfTag,
): Promise<void> {
  const lastEvent = answerEvents.value.at(-1)
  if (!lastEvent) return

  const updatedEvent = { ...lastEvent, errorSelfTag }
  await db.answerEvents.put(updatedEvent)

  const progress = progressRecords.value[lastEvent.exerciseId]
  if (progress && progress.answerLog.length > 0) {
    const lastLogIdx = progress.answerLog.length - 1
    const updatedLog = [...progress.answerLog]
    updatedLog[lastLogIdx] = { ...updatedLog[lastLogIdx], errorSelfTag }
    const updatedRecord = { ...progress, answerLog: updatedLog }
    await db.exerciseProgress.put(updatedRecord)
    replaceProgressRecord(updatedRecord)
  }

  const idx = answerEvents.value.length - 1
  answerEvents.value[idx] = updatedEvent
}
