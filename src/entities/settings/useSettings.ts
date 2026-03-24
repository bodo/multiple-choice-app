import { ref, watch } from 'vue'

const STORAGE_KEY = 'bodo-mc-settings'

interface StoredSettings {
  autoAdvance: boolean
  language: string
}

function load(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        autoAdvance: parsed.autoAdvance ?? true,
        language: parsed.language ?? 'eng',
      }
    }
  } catch { /* ignore */ }
  return { autoAdvance: true, language: 'eng' }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    autoAdvance: autoAdvance.value,
    language: language.value,
  }))
}

const stored = load()

// Module-level singletons — all callers share the same refs
const autoAdvance = ref<boolean>(stored.autoAdvance)
const language = ref<string>(stored.language)

watch(autoAdvance, save)
watch(language, save)

export function useSettings() {
  return { autoAdvance, language }
}
