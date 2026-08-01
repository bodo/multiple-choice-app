import { liveQuery, type Subscription } from 'dexie'
import { computed, ref } from 'vue'
import { db, type StoredAnswerEvent } from '../../db/db'

export const DAILY_GOAL_TARGET = 30

export interface DailyGoalProgress {
  completed: number
  remaining: number
  target: number
  percentage: number
  boxCounts: number[]
}

function localDayRange(date: Date): [number, number] {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return [start.getTime(), end.getTime()]
}

function creditedEvents(events: StoredAnswerEvent[]): StoredAnswerEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    if (!event.correct || event.dailyGoalCredit === false) return false
    if (seen.has(event.exerciseId)) return false
    seen.add(event.exerciseId)
    return true
  })
}

export class DailyGoalService {
  async getProgress(date = new Date()): Promise<DailyGoalProgress> {
    const [start, end] = localDayRange(date)
    const events = await db.answerEvents
      .where('occurredAt')
      .between(start, end, true, false)
      .sortBy('occurredAt')
    const credits = creditedEvents(events)
    const boxCounts = [0, 0, 0, 0, 0, 0]
    for (const event of credits) {
      const box = Math.min(5, Math.max(1, event.boxBefore ?? 1))
      boxCounts[box]++
    }
    const completed = credits.length

    return {
      completed,
      remaining: Math.max(0, DAILY_GOAL_TARGET - completed),
      target: DAILY_GOAL_TARGET,
      percentage: Math.min(100, Math.round(completed / DAILY_GOAL_TARGET * 100)),
      boxCounts,
    }
  }
}

const service = new DailyGoalService()
const progress = ref<DailyGoalProgress>({
  completed: 0,
  remaining: DAILY_GOAL_TARGET,
  target: DAILY_GOAL_TARGET,
  percentage: 0,
  boxCounts: [0, 0, 0, 0, 0, 0],
})
let subscription: Subscription | undefined

export async function initializeDailyGoal(): Promise<void> {
  progress.value = await service.getProgress()
  subscription?.unsubscribe()
  subscription = liveQuery(() => service.getProgress()).subscribe({
    next(value) {
      progress.value = value
    },
    error(error) {
      console.warn('Daily goal could not be read from IndexedDB.', error)
    },
  })
}

export function useDailyGoal() {
  return {
    progress,
    isComplete: computed(() => progress.value.completed >= progress.value.target),
  }
}
