import { ref, watch } from 'vue'

const STORAGE_KEY = 'bodo-mc-settings'

interface StoredSettings {
  autoAdvance: boolean
  language: string
  theme: string
  timeoutCorrect: number
  timeoutIncorrect: number
  mode: 'train' | 'exam'
}

function load(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        autoAdvance: parsed.autoAdvance ?? true,
        language: parsed.language ?? 'eng',
        theme: parsed.theme ?? 'auto',
        timeoutCorrect: parsed.timeoutCorrect ?? 1500,
        timeoutIncorrect: parsed.timeoutIncorrect ?? 3000,
        mode: parsed.mode ?? 'train',
      }
    }
  } catch { /* ignore */ }
  return { autoAdvance: true, language: 'eng', theme: 'auto', timeoutCorrect: 1500, timeoutIncorrect: 3000, mode: 'train' }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    autoAdvance: autoAdvance.value,
    language: language.value,
    theme: theme.value,
    timeoutCorrect: timeoutCorrect.value,
    timeoutIncorrect: timeoutIncorrect.value,
    mode: mode.value,
  }))
}

const stored = load()

// Module-level singletons — all callers share the same refs
const autoAdvance = ref<boolean>(stored.autoAdvance)
const language = ref<string>(stored.language)
const theme = ref<string>(stored.theme)
const timeoutCorrect = ref<number>(stored.timeoutCorrect)
const timeoutIncorrect = ref<number>(stored.timeoutIncorrect)
const mode = ref<'train' | 'exam'>(stored.mode)

watch(autoAdvance, save)
watch(language, save)
watch(theme, save)
watch(timeoutCorrect, save)
watch(timeoutIncorrect, save)
watch(mode, (newMode) => {
  // Exam mode auto-enables auto-advance
  if (newMode === 'exam') {
    autoAdvance.value = true
  }
  save()
})

export function useSettings() {
  return { autoAdvance, language, theme, timeoutCorrect, timeoutIncorrect, mode }
}
