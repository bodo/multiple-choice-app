const HISTORY_KEY = 'bodo-mc-history'
const STREAKS_KEY = 'bodo-mc-streaks'
const SESSIONS_KEY = 'bodo-mc-sessions'

// --- Per-exercise records (for spaced repetition) ---

export interface ExerciseRecord {
  correct: number
  wrong: number
  lastSeen: number
}

type HistoryMap = Record<string, ExerciseRecord>

function loadHistory(): HistoryMap {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
}

const history = loadHistory()

export function recordAnswer(id: string, isCorrect: boolean) {
  if (!history[id]) {
    history[id] = { correct: 0, wrong: 0, lastSeen: 0 }
  }
  if (isCorrect) {
    history[id].correct++
  } else {
    history[id].wrong++
  }
  history[id].lastSeen = Date.now()
  saveHistory()

  // Update streak
  if (isCorrect) {
    currentStreak++
  } else {
    endStreak()
    currentStreak = 0
  }

  // Update session
  recordToSession(isCorrect)
}

export function getRecord(id: string): ExerciseRecord {
  return history[id] ?? { correct: 0, wrong: 0, lastSeen: 0 }
}

export function getWeight(id: string): number {
  const r = history[id]
  if (!r) return 10

  const total = r.correct + r.wrong
  const errorRate = total > 0 ? r.wrong / total : 0.5
  const hoursSince = Math.min((Date.now() - r.lastSeen) / 3_600_000, 168)
  return (1 + errorRate * 9) * (1 + hoursSince / 24)
}

export function getAllRecords(): HistoryMap {
  return { ...history }
}

// --- Streak tracking ---

export interface StreakEntry {
  date: string   // ISO date string
  length: number
}

function loadStreaks(): StreakEntry[] {
  try {
    const raw = localStorage.getItem(STREAKS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveStreaks() {
  localStorage.setItem(STREAKS_KEY, JSON.stringify(streaks))
}

const streaks = loadStreaks()
let currentStreak = 0

function endStreak() {
  if (currentStreak > 0) {
    streaks.push({ date: new Date().toISOString(), length: currentStreak })
    saveStreaks()
  }
}

export function getCurrentStreak(): number {
  return currentStreak
}

export function getAllStreaks(): StreakEntry[] {
  return [...streaks]
}

export function getLongestStreak(): number {
  let max = currentStreak
  for (const s of streaks) {
    if (s.length > max) max = s.length
  }
  return max
}

// --- Session tracking ---

export interface SessionEntry {
  date: string      // ISO date string (start)
  questions: number
  correct: number
  durationMs: number
}

function loadSessions(): SessionEntry[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveSessions() {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

const sessions = loadSessions()
let sessionStart = Date.now()
let sessionQuestions = 0
let sessionCorrect = 0

function recordToSession(isCorrect: boolean) {
  sessionQuestions++
  if (isCorrect) sessionCorrect++
  // Auto-save current session periodically
  saveCurrentSession()
}

function saveCurrentSession() {
  if (sessionQuestions === 0) return
  const entry: SessionEntry = {
    date: new Date(sessionStart).toISOString(),
    questions: sessionQuestions,
    correct: sessionCorrect,
    durationMs: Date.now() - sessionStart,
  }
  // Replace or append current session (last entry if same start)
  if (sessions.length > 0 && sessions[sessions.length - 1].date === entry.date) {
    sessions[sessions.length - 1] = entry
  } else {
    sessions.push(entry)
  }
  saveSessions()
}

export function getAllSessions(): SessionEntry[] {
  return [...sessions]
}

export function getStats() {
  const allSessions = getAllSessions()
  const allStreakEntries = getAllStreaks()

  const totalQuestions = allSessions.reduce((s, e) => s + e.questions, 0)
  const totalCorrect = allSessions.reduce((s, e) => s + e.correct, 0)
  const totalDurationMs = allSessions.reduce((s, e) => s + e.durationMs, 0)
  const totalSessions = allSessions.length

  const uniqueDays = new Set(allSessions.map(s => s.date.slice(0, 10))).size

  const streakLengths = [...allStreakEntries.map(s => s.length), currentStreak].filter(l => l > 0)
  const longestStreak = streakLengths.length > 0 ? Math.max(...streakLengths) : 0
  const shortestStreak = streakLengths.length > 0 ? Math.min(...streakLengths) : 0
  const averageStreak = streakLengths.length > 0 ? streakLengths.reduce((a, b) => a + b, 0) / streakLengths.length : 0
  const totalStreaks = streakLengths.length

  return {
    totalQuestions,
    totalCorrect,
    totalAccuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
    totalDurationMs,
    totalSessions,
    uniqueDays,
    currentStreak,
    longestStreak,
    shortestStreak,
    averageStreak: Math.round(averageStreak * 10) / 10,
    totalStreaks,
  }
}
