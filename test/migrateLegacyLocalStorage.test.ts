import assert from 'node:assert/strict'
import test, { after, afterEach, beforeEach } from 'node:test'
import 'fake-indexeddb/auto'

const { db } = await import('../src/db/db.ts')
const { migrateLegacyLocalStorage } = await import(
  '../src/db/migrateLegacyLocalStorage.ts'
)

const SETTINGS_KEY = 'bodo-mc-settings'
const HISTORY_KEY = 'bodo-mc-history'
const MIGRATION_KEY = 'legacy-local-storage-v1'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const memoryStorage = new MemoryStorage()
const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  'localStorage',
)

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: memoryStorage,
})

function storeLegacyProgress(): void {
  memoryStorage.setItem(SETTINGS_KEY, JSON.stringify({
    language: 'deu',
    learningLevel: 3,
  }))
  memoryStorage.setItem(HISTORY_KEY, JSON.stringify({
    exercise_001: {
      correct: 2,
      wrong: 1,
      lastSeen: 1_722_500_000_000,
      box: 3,
      avgTimeMs: 4_200,
      answerLog: [
        { date: 1_722_400_000_000, correct: true, timeMs: 4_000 },
        { date: 1_722_500_000_000, correct: false, timeMs: 4_400 },
      ],
    },
  }))
}

beforeEach(async () => {
  memoryStorage.clear()
  await db.delete()
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

after(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

test('migrates learning level and exercise progress before removing legacy data', async () => {
  storeLegacyProgress()

  await migrateLegacyLocalStorage('persistent')

  const settings = await db.settings.get('app')
  const progress = await db.exerciseProgress.get('exercise_001')

  assert.equal(
    (settings?.value as { learningLevel?: unknown }).learningLevel,
    3,
  )
  assert.deepEqual(progress, {
    exerciseId: 'exercise_001',
    correct: 2,
    wrong: 1,
    lastSeen: 1_722_500_000_000,
    box: 3,
    avgTimeMs: 4_200,
    answerLog: [
      { date: 1_722_400_000_000, correct: true, timeMs: 4_000 },
      { date: 1_722_500_000_000, correct: false, timeMs: 4_400 },
    ],
    learningStatus: 'active',
    weakspotReason: null,
    weakspotAt: null,
    interventionCount: 0,
    lastReturnedAt: null,
    xp: 8,
  })
  assert.equal(memoryStorage.getItem(SETTINGS_KEY), null)
  assert.equal(memoryStorage.getItem(HISTORY_KEY), null)
})

test('retains legacy data while browser storage is not persistent', async () => {
  for (const status of ['best-effort', 'unsupported'] as const) {
    storeLegacyProgress()

    await migrateLegacyLocalStorage(status)

    assert.ok(await db.exerciseProgress.get('exercise_001'))
    assert.notEqual(memoryStorage.getItem(SETTINGS_KEY), null)
    assert.notEqual(memoryStorage.getItem(HISTORY_KEY), null)

    await db.delete()
    await db.open()
    memoryStorage.clear()
  }
})

test('removes retained legacy data once persistence is confirmed', async () => {
  storeLegacyProgress()
  await migrateLegacyLocalStorage('best-effort')

  await migrateLegacyLocalStorage('persistent')

  assert.equal(memoryStorage.getItem(SETTINGS_KEY), null)
  assert.equal(memoryStorage.getItem(HISTORY_KEY), null)
  assert.ok(await db.metadata.get(MIGRATION_KEY))
})

test('retains legacy data when the IndexedDB transaction fails', async () => {
  storeLegacyProgress()
  const progressTable = db.exerciseProgress
  const originalBulkPut = progressTable.bulkPut
  progressTable.bulkPut = (() => Promise.reject(
    new Error('forced migration failure'),
  )) as typeof progressTable.bulkPut

  try {
    await assert.rejects(
      () => migrateLegacyLocalStorage('persistent'),
      /forced migration failure/,
    )
  } finally {
    progressTable.bulkPut = originalBulkPut
  }

  assert.notEqual(memoryStorage.getItem(SETTINGS_KEY), null)
  assert.notEqual(memoryStorage.getItem(HISTORY_KEY), null)
  assert.equal(await db.metadata.get(MIGRATION_KEY), undefined)
})
