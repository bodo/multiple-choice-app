import { ref, computed } from 'vue'
import type { Exercise } from './exercise'

/**
 * Exercise catalog — provides the learner-facing category index and filtering.
 *
 * Currently built from loaded exercise data.
 * Can be replaced later with a server-provided index
 * by swapping the `buildFromExercises` call with a fetch.
 */

export interface CatalogEntry {
  id: string
  categories: string[]
  inputMode: string
}

const entries = ref<CatalogEntry[]>([])
const activeCategoryFilter = ref<string | null>(null)

/** All unique categories across all exercises, sorted */
const allCategories = computed(() => {
  const categorySet = new Set<string>()
  for (const entry of entries.value) {
    for (const category of entry.categories) {
      categorySet.add(category)
    }
  }
  return [...categorySet].sort()
})

/** Exercise IDs matching the current filter (or all if no filter) */
const categoryFilteredIds = computed(() => {
  if (!activeCategoryFilter.value) {
    return new Set(entries.value.map(entry => entry.id))
  }
  return new Set(
    entries.value
      .filter(entry =>
        entry.categories.includes(activeCategoryFilter.value!))
      .map(entry => entry.id),
  )
})

/** Build the catalog from loaded exercises */
function buildFromExercises(exercises: Exercise[]) {
  entries.value = exercises.map(ex => ({
    id: ex.id,
    categories: ex.categories ?? [],
    inputMode: ex.inputMode,
  }))
}

function setCategoryFilter(category: string | null) {
  activeCategoryFilter.value = category
}

export function useExerciseCatalog() {
  return {
    allCategories,
    activeCategoryFilter,
    categoryFilteredIds,
    buildFromExercises,
    setCategoryFilter,
  }
}
