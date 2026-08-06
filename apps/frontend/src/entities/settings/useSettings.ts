import { ref, watch } from 'vue'
import { db } from '../../db/db'
import {
  normalizeLearningLevel,
  type LearningLevel,
} from '../exercise/learningLevel'

export type Specialization = 'FIAN' | 'FISI' | 'FIDP' | 'FIDV'

export const specializations: Specialization[] = [
  'FIAN',
  'FISI',
  'FIDP',
  'FIDV',
]

interface StoredSettings {
  autoAdvance: boolean
  language: string
  theme: string
  timeoutCorrect: number
  timeoutIncorrect: number
  mode: 'train' | 'exam'
  soundEnabled: boolean
  hapticEnabled: boolean
  examQuestionCount: number
  exerciseSource: 'json' | 'api'
  mobileSolvableOnly: boolean
  specialization: Specialization
  learningLevel: LearningLevel
  automaticLevelProgression: boolean
  hideOptionsInitially: boolean
}

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    mobile?: boolean
  }
}

function guessMobileSolvableOnly(): boolean {
  const mobileHint = (navigator as NavigatorWithUserAgentData).userAgentData?.mobile
  if (typeof mobileHint === 'boolean') return mobileHint

  const hasTouchInput = navigator.maxTouchPoints > 0
    || window.matchMedia('(pointer: coarse)').matches
  const shortestScreenSide = Math.min(window.screen.width, window.screen.height)
  return hasTouchInput && shortestScreenSide <= 1024
}

function defaultSettings(): StoredSettings {
  return {
    autoAdvance: false,
    language: 'eng',
    theme: 'auto',
    timeoutCorrect: 10000,
    timeoutIncorrect: 20000,
    mode: 'train',
    soundEnabled: false,
    hapticEnabled: true,
    examQuestionCount: 10,
    exerciseSource: 'json',
    mobileSolvableOnly: guessMobileSolvableOnly(),
    specialization: 'FIAN',
    learningLevel: 1,
    automaticLevelProgression: true,
    hideOptionsInitially: true,
  }
}

function parseSpecialization(value: unknown): Specialization {
  return typeof value === 'string'
    && specializations.includes(value as Specialization)
    ? value as Specialization
    : 'FIAN'
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeSettings(value: unknown): StoredSettings {
  const defaults = defaultSettings()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
  const candidate = value as Record<string, unknown>
  const storedAutoAdvance = typeof candidate.autoAdvance === 'boolean'
    ? candidate.autoAdvance
    : undefined
  const hasStoredAutoAdvance = storedAutoAdvance !== undefined

  return {
    autoAdvance: storedAutoAdvance ?? defaults.autoAdvance,
    language: candidate.language === 'deu' ? 'deu' : 'eng',
    theme: typeof candidate.theme === 'string' ? candidate.theme : defaults.theme,
    timeoutCorrect: hasStoredAutoAdvance
      ? finiteNumber(candidate.timeoutCorrect, defaults.timeoutCorrect)
      : defaults.timeoutCorrect,
    timeoutIncorrect: hasStoredAutoAdvance
      ? finiteNumber(candidate.timeoutIncorrect, defaults.timeoutIncorrect)
      : defaults.timeoutIncorrect,
    mode: candidate.mode === 'exam' ? 'exam' : 'train',
    soundEnabled: typeof candidate.soundEnabled === 'boolean'
      ? candidate.soundEnabled
      : defaults.soundEnabled,
    hapticEnabled: typeof candidate.hapticEnabled === 'boolean'
      ? candidate.hapticEnabled
      : defaults.hapticEnabled,
    examQuestionCount: finiteNumber(
      candidate.examQuestionCount,
      defaults.examQuestionCount,
    ),
    exerciseSource: candidate.exerciseSource === 'api' ? 'api' : 'json',
    mobileSolvableOnly: typeof candidate.mobileSolvableOnly === 'boolean'
      ? candidate.mobileSolvableOnly
      : defaults.mobileSolvableOnly,
    specialization: parseSpecialization(candidate.specialization),
    learningLevel: normalizeLearningLevel(candidate.learningLevel),
    automaticLevelProgression:
      typeof candidate.automaticLevelProgression === 'boolean'
        ? candidate.automaticLevelProgression
        : defaults.automaticLevelProgression,
    hideOptionsInitially: typeof candidate.hideOptionsInitially === 'boolean'
      ? candidate.hideOptionsInitially
      : defaults.hideOptionsInitially,
  }
}

const defaults = defaultSettings()
const autoAdvance = ref(defaults.autoAdvance)
const language = ref(defaults.language)
const theme = ref(defaults.theme)
const timeoutCorrect = ref(defaults.timeoutCorrect)
const timeoutIncorrect = ref(defaults.timeoutIncorrect)
const mode = ref<StoredSettings['mode']>(defaults.mode)
const soundEnabled = ref(defaults.soundEnabled)
const hapticEnabled = ref(defaults.hapticEnabled)
const examQuestionCount = ref(defaults.examQuestionCount)
const exerciseSource = ref<StoredSettings['exerciseSource']>(defaults.exerciseSource)
const mobileSolvableOnly = ref(defaults.mobileSolvableOnly)
const specialization = ref<Specialization>(defaults.specialization)
const learningLevel = ref<LearningLevel>(defaults.learningLevel)
const automaticLevelProgression = ref(defaults.automaticLevelProgression)
const hideOptionsInitially = ref(defaults.hideOptionsInitially)

let initialized = false

function currentSettings(): StoredSettings {
  return {
    autoAdvance: autoAdvance.value,
    language: language.value,
    theme: theme.value,
    timeoutCorrect: timeoutCorrect.value,
    timeoutIncorrect: timeoutIncorrect.value,
    mode: mode.value,
    soundEnabled: soundEnabled.value,
    hapticEnabled: hapticEnabled.value,
    examQuestionCount: examQuestionCount.value,
    exerciseSource: exerciseSource.value,
    mobileSolvableOnly: mobileSolvableOnly.value,
    specialization: specialization.value,
    learningLevel: learningLevel.value,
    automaticLevelProgression: automaticLevelProgression.value,
    hideOptionsInitially: hideOptionsInitially.value,
  }
}

function applySettings(settings: StoredSettings) {
  autoAdvance.value = settings.autoAdvance
  language.value = settings.language
  theme.value = settings.theme
  timeoutCorrect.value = settings.timeoutCorrect
  timeoutIncorrect.value = settings.timeoutIncorrect
  mode.value = settings.mode
  soundEnabled.value = settings.soundEnabled
  hapticEnabled.value = settings.hapticEnabled
  examQuestionCount.value = settings.examQuestionCount
  exerciseSource.value = settings.exerciseSource
  mobileSolvableOnly.value = settings.mobileSolvableOnly
  specialization.value = settings.specialization
  learningLevel.value = settings.learningLevel
  automaticLevelProgression.value = settings.automaticLevelProgression
  hideOptionsInitially.value = settings.hideOptionsInitially
}

async function save() {
  try {
    await db.settings.put({ id: 'app', value: currentSettings() })
  } catch (error) {
    console.warn('Settings could not be stored in IndexedDB.', error)
  }
}

function startPersistence() {
  watch(
    [
      autoAdvance,
      language,
      theme,
      timeoutCorrect,
      timeoutIncorrect,
      soundEnabled,
      hapticEnabled,
      examQuestionCount,
      exerciseSource,
      mobileSolvableOnly,
      specialization,
      learningLevel,
      automaticLevelProgression,
      hideOptionsInitially,
      mode,
    ],
    () => { void save() },
  )

  watch(mode, (newMode) => {
    if (newMode === 'exam') autoAdvance.value = true
  })
}

export async function initializeSettings(): Promise<void> {
  if (initialized) return
  const stored = await db.settings.get('app')
  applySettings(normalizeSettings(stored?.value))
  initialized = true
  startPersistence()
  await save()
}

export function useSettings() {
  return {
    autoAdvance,
    language,
    theme,
    timeoutCorrect,
    timeoutIncorrect,
    mode,
    soundEnabled,
    hapticEnabled,
    examQuestionCount,
    exerciseSource,
    mobileSolvableOnly,
    specialization,
    learningLevel,
    automaticLevelProgression,
    hideOptionsInitially,
  }
}
