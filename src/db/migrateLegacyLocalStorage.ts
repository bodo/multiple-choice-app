import {
  db,
  type StoredAnswerEvent,
  type StoredAnswerLogEntry,
  type StoredBookmark,
  type StoredExerciseProgress,
  type StoredPracticeSession,
  type StoredStreak,
} from './db.ts'
import type { StoragePersistenceStatus } from './storagePersistence'

const MIGRATION_KEY = 'legacy-local-storage-v1'
const SETTINGS_KEY = 'bodo-mc-settings'
const HISTORY_KEY = 'bodo-mc-history'
const BOOKMARKS_KEY = 'bodo-mc-bookmarks'
const SESSIONS_KEY = 'bodo-mc-sessions'
const STREAKS_KEY = 'bodo-mc-streaks'
const THEME_KEY = 'theme'
const LEGACY_KEYS = [
  SETTINGS_KEY,
  HISTORY_KEY,
  BOOKMARKS_KEY,
  SESSIONS_KEY,
  STREAKS_KEY,
  THEME_KEY,
]

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = finiteNumber(value, fallback)
  return Math.max(0, Math.floor(number))
}

function parseAnswerLog(value: unknown): StoredAnswerLogEntry[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Record<string, unknown>
    if (typeof candidate.correct !== 'boolean') return []

    return [{
      date: finiteNumber(candidate.date),
      correct: candidate.correct,
      timeMs: Math.max(0, finiteNumber(candidate.timeMs)),
    }]
  }).filter(entry => entry.date > 0).slice(-20)
}

function parseProgress(): StoredExerciseProgress[] {
  const value = readJson(HISTORY_KEY)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  return Object.entries(value).flatMap(([exerciseId, entry]) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Record<string, unknown>
    const correct = positiveInteger(candidate.correct, 0)
    const wrong = positiveInteger(candidate.wrong, 0)
    if (correct + wrong === 0) return []
    const box = Math.min(5, Math.max(1, positiveInteger(candidate.box, 1)))

    return [{
      exerciseId,
      correct,
      wrong,
      lastSeen: Math.max(0, finiteNumber(candidate.lastSeen)),
      box,
      avgTimeMs: Math.max(0, finiteNumber(candidate.avgTimeMs)),
      answerLog: parseAnswerLog(candidate.answerLog),
      learningStatus: 'active' as const,
      weakspotReason: null,
      weakspotAt: null,
      interventionCount: 0,
      lastReturnedAt: null,
      xp: Math.round(correct * 2 + Math.min(wrong, 1) * 0.5 + box),
    }]
  })
}

function parseBookmarks(): StoredBookmark[] {
  const value = readJson(BOOKMARKS_KEY)
  if (!Array.isArray(value)) return []
  const createdAt = Date.now()

  return [...new Set(value.filter(id => typeof id === 'string' && id.length > 0))]
    .map((exerciseId, index) => ({ exerciseId, createdAt: createdAt + index }))
}

function parsePracticeSessions(): StoredPracticeSession[] {
  const value = readJson(SESSIONS_KEY)
  if (!Array.isArray(value)) return []

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Record<string, unknown>
    if (typeof candidate.date !== 'string') return []

    return [{
      id: `legacy-session-${index}-${candidate.date}`,
      date: candidate.date,
      questions: positiveInteger(candidate.questions, 0),
      correct: positiveInteger(candidate.correct, 0),
      durationMs: Math.max(0, finiteNumber(candidate.durationMs)),
    }]
  })
}

function parseStreaks(): StoredStreak[] {
  const value = readJson(STREAKS_KEY)
  if (!Array.isArray(value)) return []

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Record<string, unknown>
    if (typeof candidate.date !== 'string') return []
    const length = positiveInteger(candidate.length, 0)
    if (length === 0) return []

    return [{ id: `legacy-streak-${index}-${candidate.date}`, date: candidate.date, length }]
  })
}

function answerEventsFromProgress(
  progress: StoredExerciseProgress[],
): StoredAnswerEvent[] {
  return progress.flatMap(record => record.answerLog.map((answer, index) => ({
    id: `legacy-answer-${record.exerciseId}-${answer.date}-${index}`,
    exerciseId: record.exerciseId,
    correct: answer.correct,
    durationMs: answer.timeMs,
    occurredAt: answer.date,
    mode: 'train' as const,
  })))
}

function parseSettings(): unknown | null {
  const value = readJson(SETTINGS_KEY)
  if (value && typeof value === 'object' && !Array.isArray(value)) return value

  try {
    const theme = localStorage.getItem(THEME_KEY)
    return theme ? { theme } : null
  } catch {
    return null
  }
}

function removeLegacyKeys() {
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      // IndexedDB already contains the imported data. A leftover key is harmless.
    }
  }
}

export async function migrateLegacyLocalStorage(
  storagePersistenceStatus: StoragePersistenceStatus,
): Promise<void> {
  const canRemoveLegacyData = storagePersistenceStatus === 'persistent'
  const completed = await db.metadata.get(MIGRATION_KEY)
  if (completed) {
    if (canRemoveLegacyData) removeLegacyKeys()
    return
  }

  const progress = parseProgress()
  const bookmarks = parseBookmarks()
  const practiceSessions = parsePracticeSessions()
  const streaks = parseStreaks()
  const answerEvents = answerEventsFromProgress(progress)
  const settings = parseSettings()

  await db.transaction(
    'rw',
    [
      db.exerciseProgress,
      db.bookmarks,
      db.practiceSessions,
      db.streaks,
      db.answerEvents,
      db.settings,
      db.metadata,
    ],
    async () => {
      if (progress.length > 0) await db.exerciseProgress.bulkPut(progress)
      if (bookmarks.length > 0) await db.bookmarks.bulkPut(bookmarks)
      if (practiceSessions.length > 0) {
        await db.practiceSessions.bulkPut(practiceSessions)
      }
      if (streaks.length > 0) await db.streaks.bulkPut(streaks)
      if (answerEvents.length > 0) await db.answerEvents.bulkPut(answerEvents)
      if (settings) await db.settings.put({ id: 'app', value: settings })
      await db.metadata.put({ key: MIGRATION_KEY, value: Date.now() })
    },
  )

  if (canRemoveLegacyData) removeLegacyKeys()
}
