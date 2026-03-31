const HISTORY_KEY = 'bodo-mc-history'
const STREAKS_KEY = 'bodo-mc-streaks'
const SESSIONS_KEY = 'bodo-mc-sessions'

// --- Per-exercise records with Leitner box and answer log ---

export interface AnswerLogEntry {
  date: number    // timestamp
  correct: boolean
  timeMs: number  // time to answer
}

export interface ExerciseRecord {
  correct: number
  wrong: number
  lastSeen: number
  box: number            // Leitner box 0-5 (0 = never seen / reset)
  avgTimeMs: number      // running average answer time
  answerLog: AnswerLogEntry[]  // recent answer history (keep last 20)
}

const MAX_LOG_ENTRIES = 20

type HistoryMap = Record<string, ExerciseRecord>

function loadHistory(): HistoryMap {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Migrate old records that lack new fields
    for (const id of Object.keys(parsed)) {
      const r = parsed[id]
      if (r.box === undefined) r.box = 0
      if (r.avgTimeMs === undefined) r.avgTimeMs = 0
      if (r.answerLog === undefined) r.answerLog = []
    }
    return parsed
  } catch {
    return {}
  }
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
}

const history = loadHistory()

function ensureRecord(id: string): ExerciseRecord {
  if (!history[id]) {
    history[id] = { correct: 0, wrong: 0, lastSeen: 0, box: 0, avgTimeMs: 0, answerLog: [] }
  }
  return history[id]
}

export function recordAnswer(id: string, isCorrect: boolean, timeMs: number) {
  const r = ensureRecord(id)

  // Update counters
  if (isCorrect) {
    r.correct++
    // Leitner: move up one box (max 5)
    r.box = Math.min(r.box + 1, 5)
  } else {
    r.wrong++
    // Leitner: fall back to box 1
    r.box = 1
  }

  // Update average time (exponential moving average)
  const total = r.correct + r.wrong
  if (total <= 1) {
    r.avgTimeMs = timeMs
  } else {
    r.avgTimeMs = Math.round(r.avgTimeMs * 0.8 + timeMs * 0.2)
  }

  r.lastSeen = Date.now()

  // Append to answer log (keep last N)
  r.answerLog.push({ date: Date.now(), correct: isCorrect, timeMs })
  if (r.answerLog.length > MAX_LOG_ENTRIES) {
    r.answerLog = r.answerLog.slice(-MAX_LOG_ENTRIES)
  }

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
  return history[id] ?? { correct: 0, wrong: 0, lastSeen: 0, box: 0, avgTimeMs: 0, answerLog: [] }
}

/**
 * Leitner-based spaced repetition weight.
 * Higher weight = more likely to be shown.
 *
 * Box intervals (minimum hours before review):
 *   Box 0 (new):     0h   — show immediately
 *   Box 1 (reset):   0h   — show immediately
 *   Box 2:           4h
 *   Box 3:          24h   (1 day)
 *   Box 4:          72h   (3 days)
 *   Box 5:         168h   (1 week)
 *
 * Cards that are overdue get higher weight.
 * Cards not yet due get near-zero weight (but not zero, so they can still appear).
 */
const BOX_INTERVALS_HOURS = [0, 0, 4, 24, 72, 168]

export function getWeight(id: string): number {
  const r = history[id]
  if (!r) return 10 // never seen → high priority

  const hoursSince = (Date.now() - r.lastSeen) / 3_600_000
  const interval = BOX_INTERVALS_HOURS[r.box] ?? 168

  if (interval === 0) {
    // Box 0 or 1: always high priority, boosted by error rate
    const total = r.correct + r.wrong
    const errorRate = total > 0 ? r.wrong / total : 0.5
    return 5 + errorRate * 5
  }

  // How overdue is this card? ratio > 1 means overdue
  const overdueRatio = hoursSince / interval

  if (overdueRatio >= 1) {
    // Overdue: weight scales with how overdue (capped at 10)
    return Math.min(2 + overdueRatio * 2, 10)
  }

  // Not yet due: very low weight
  return 0.1
}

export function getAllRecords(): HistoryMap {
  return { ...history }
}

// --- Weakness analysis ---

export interface WeaknessInfo {
  id: string
  accuracy: number
  total: number
  box: number
  avgTimeMs: number
  recentTrend: number // -1 to 1, negative = getting worse
}

export function getWeakestExercises(limit: number = 5): WeaknessInfo[] {
  const entries: WeaknessInfo[] = []
  for (const [id, r] of Object.entries(history)) {
    const total = r.correct + r.wrong
    if (total < 2) continue // need at least 2 answers
    const accuracy = r.correct / total
    const recentTrend = computeTrend(r.answerLog)
    entries.push({ id, accuracy, total, box: r.box, avgTimeMs: r.avgTimeMs, recentTrend })
  }
  // Sort by accuracy ascending (worst first), then by box ascending
  entries.sort((a, b) => a.accuracy - b.accuracy || a.box - b.box)
  return entries.slice(0, limit)
}

function computeTrend(log: AnswerLogEntry[]): number {
  if (log.length < 4) return 0
  const half = Math.floor(log.length / 2)
  const firstHalf = log.slice(0, half)
  const secondHalf = log.slice(half)
  const firstRate = firstHalf.filter(e => e.correct).length / firstHalf.length
  const secondRate = secondHalf.filter(e => e.correct).length / secondHalf.length
  return Math.round((secondRate - firstRate) * 100) / 100
}

export function getMasteryDistribution(): number[] {
  // Returns count of exercises in each box [0..5]
  const dist = [0, 0, 0, 0, 0, 0]
  for (const r of Object.values(history)) {
    dist[r.box]++
  }
  return dist
}

export function getCategoryAccuracy(catalog: Array<{ id: string; tags: string[] }>): Array<{ tag: string; accuracy: number; total: number }> {
  const tagStats: Record<string, { correct: number; total: number }> = {}
  for (const entry of catalog) {
    const r = history[entry.id]
    if (!r) continue
    const total = r.correct + r.wrong
    if (total === 0) continue
    for (const tag of entry.tags) {
      if (!tagStats[tag]) tagStats[tag] = { correct: 0, total: 0 }
      tagStats[tag].correct += r.correct
      tagStats[tag].total += total
    }
  }
  return Object.entries(tagStats)
    .map(([tag, s]) => ({ tag, accuracy: Math.round((s.correct / s.total) * 100), total: s.total }))
    .sort((a, b) => a.accuracy - b.accuracy)
}

// --- Rank / title system ---

export interface RankInfo {
  title: string
  level: number       // 1-10
  xp: number          // total XP earned
  nextLevelXp: number // XP needed for next level
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

export function getRank(): RankInfo {
  // XP: 2 per correct, 0.5 per wrong (you still practiced), bonus for high box
  let xp = 0
  for (const r of Object.values(history)) {
    xp += r.correct * 2 + r.wrong * 0.5 + r.box * 1
  }
  xp = Math.round(xp)

  let level = 1
  let nextLevelXp = RANKS[1]?.minXp ?? 999999
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].minXp) {
      level = i + 1
      nextLevelXp = RANKS[i + 1]?.minXp ?? RANKS[i].minXp
      break
    }
  }

  return { title: RANKS[level - 1].title, level, xp, nextLevelXp }
}

// --- Streak tracking ---

export interface StreakEntry {
  date: string
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
  date: string
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
