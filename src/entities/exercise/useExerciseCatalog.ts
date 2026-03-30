import { ref, computed } from 'vue'
import type { Exercise } from './exercise'

/**
 * Exercise catalog — provides category/tag index and filtering.
 *
 * Currently built from loaded exercise data.
 * Can be replaced later with a server-provided index
 * by swapping the `buildFromExercises` call with a fetch.
 */

export interface CatalogEntry {
  id: string
  tags: string[]
  inputMode: string
}

const entries = ref<CatalogEntry[]>([])
const activeTagFilter = ref<string | null>(null)

/** All unique tags across all exercises, sorted */
const allTags = computed(() => {
  const tagSet = new Set<string>()
  for (const entry of entries.value) {
    for (const tag of entry.tags) {
      tagSet.add(tag)
    }
  }
  return [...tagSet].sort()
})

/** Exercise IDs matching the current filter (or all if no filter) */
const filteredIds = computed(() => {
  if (!activeTagFilter.value) return new Set(entries.value.map(e => e.id))
  return new Set(
    entries.value
      .filter(e => e.tags.includes(activeTagFilter.value!))
      .map(e => e.id),
  )
})

/** Build the catalog from loaded exercises */
function buildFromExercises(exercises: Exercise[]) {
  entries.value = exercises.map(ex => ({
    id: ex.id,
    tags: ex.adminTags ?? [],
    inputMode: ex.inputMode,
  }))
}

function setTagFilter(tag: string | null) {
  activeTagFilter.value = tag
}

export function useExerciseCatalog() {
  return {
    allTags,
    activeTagFilter,
    filteredIds,
    buildFromExercises,
    setTagFilter,
  }
}
