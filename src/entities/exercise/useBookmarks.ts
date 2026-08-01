import { liveQuery, type Subscription } from 'dexie'
import { computed, ref } from 'vue'
import { db, type StoredBookmark } from '../../db/db'

const bookmarkItems = ref<StoredBookmark[]>([])
const bookmarks = computed(() => new Set(
  bookmarkItems.value.map(bookmark => bookmark.exerciseId),
))
let subscription: Subscription | undefined

export async function initializeBookmarks(): Promise<void> {
  bookmarkItems.value = await db.bookmarks.orderBy('createdAt').toArray()
  subscription?.unsubscribe()
  subscription = liveQuery(() => db.bookmarks.orderBy('createdAt').toArray())
    .subscribe({
      next(items) {
        bookmarkItems.value = items
      },
      error(error) {
        console.warn('Bookmarks could not be read from IndexedDB.', error)
      },
    })
}

export async function addBookmark(exerciseId: string): Promise<void> {
  await db.bookmarks.put({ exerciseId, createdAt: Date.now() })
}

export async function removeBookmark(exerciseId: string): Promise<void> {
  await db.bookmarks.delete(exerciseId)
}

export async function toggleBookmark(exerciseId: string): Promise<void> {
  const existing = await db.bookmarks.get(exerciseId)
  if (existing) {
    await removeBookmark(exerciseId)
  } else {
    await addBookmark(exerciseId)
  }
}

export function isBookmarked(exerciseId: string): boolean {
  return bookmarks.value.has(exerciseId)
}

export function useBookmarks() {
  return {
    bookmarkItems,
    bookmarks,
    addBookmark,
    removeBookmark,
    toggleBookmark,
    isBookmarked,
  }
}
