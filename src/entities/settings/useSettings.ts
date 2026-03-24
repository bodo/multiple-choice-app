import { ref, watch } from 'vue'

const STORAGE_KEY = 'bodo-mc-settings'

function loadAutoAdvance(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return true
    return JSON.parse(raw)?.autoAdvance ?? true
  } catch {
    return true
  }
}

// Module-level singleton — all callers share the same ref
const autoAdvance = ref<boolean>(loadAutoAdvance())

watch(autoAdvance, (val) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ autoAdvance: val }))
})

export function useSettings() {
  return { autoAdvance }
}
