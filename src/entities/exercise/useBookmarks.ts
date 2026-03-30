import { ref } from 'vue'

const STORAGE_KEY = 'bodo-mc-bookmarks'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...bookmarkSet]))
}

const bookmarkSet = load()
const bookmarks = ref(new Set(bookmarkSet))

function sync() {
  bookmarks.value = new Set(bookmarkSet)
}

export function toggleBookmark(id: string) {
  if (bookmarkSet.has(id)) {
    bookmarkSet.delete(id)
  } else {
    bookmarkSet.add(id)
  }
  save()
  sync()
}

export function isBookmarked(id: string): boolean {
  return bookmarkSet.has(id)
}

export function getBookmarks(): Set<string> {
  return new Set(bookmarkSet)
}

export function useBookmarks() {
  return {
    bookmarks,
    toggleBookmark,
    isBookmarked,
    getBookmarks,
  }
}
