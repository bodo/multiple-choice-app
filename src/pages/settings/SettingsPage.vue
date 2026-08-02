<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  BookOpen,
  MonitorCog,
  UserRound,
  Wifi,
  WifiOff,
} from 'lucide-vue-next'
import {
  specializations,
  type Specialization,
  useSettings,
} from '../../entities/settings/useSettings'
import { useNetworkStatus } from '../../entities/network/useNetworkStatus'
import {
  learningLevelDefinitions,
  type LearningLevel,
} from '../../entities/exercise/learningLevel'
import { useExercises } from '../../entities/exercise/useExercises'
import { assessLearningLevel } from '../../entities/exercise/services/learningLevelService'

const { t } = useI18n()
const {
  autoAdvance,
  language,
  theme,
  mode,
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
} = useSettings()
const { exercises } = useExercises()
const {
  isOnline,
  connectionType,
  effectiveConnectionType,
} = useNetworkStatus()

const languages = [
  { code: 'eng', label: 'English' },
  { code: 'deu', label: 'Deutsch' },
]

const modes: Array<{ code: 'train' | 'exam', label: string }> = [
  { code: 'train', label: t('trainMode') },
  { code: 'exam', label: t('examMode') },
]
const specializationLabelKeys: Record<Specialization, string> = {
  FIAN: 'specializationFIAN',
  FISI: 'specializationFISI',
  FIDP: 'specializationFIDP',
  FIDV: 'specializationFIDV',
}

const autoAdvanceDisabled = computed(() => mode.value === 'exam')
const learningLevelAssessment = computed(() =>
  assessLearningLevel(exercises.value, learningLevel.value))
const selectedLearningLevel = computed(() =>
  learningLevelDefinitions.find(level => level.value === learningLevel.value))
const learningLevelDisplay = computed(() => {
  const label = selectedLearningLevel.value
    ? t(selectedLearningLevel.value.labelKey)
    : String(learningLevel.value)
  return `${learningLevel.value} · ${label}`
})
const apiExerciseSourceEnabled = computed({
  get: () => exerciseSource.value === 'api',
  set: enabled => {
    exerciseSource.value = enabled ? 'api' : 'json'
  },
})
const connectionDescription = computed(() => {
  if (!isOnline.value) return t('networkOfflineHint')
  if (connectionType.value === 'wifi') return t('networkWifi')
  if (connectionType.value === 'cellular') {
    const effectiveType = effectiveConnectionType.value?.toUpperCase()
    return effectiveType
      ? `${t('networkCellular')} (${effectiveType})`
      : t('networkCellular')
  }
  if (connectionType.value === 'ethernet') return t('networkEthernet')
  if (
    connectionType.value !== 'unknown'
    && connectionType.value !== 'none'
  ) return t('networkOther')
  return t('networkTypeUnavailable')
})

function formatSeconds(value: number): string {
  return `${value.toFixed(1)}s`
}

function setLearningLevel(value: number) {
  learningLevel.value = value as LearningLevel
}
</script>

<template>
  <div class="p-6 max-w-md flex flex-col gap-6">
    <h1 class="text-xl font-semibold">
      {{ t('settingsTitle') }}
    </h1>

    <div
      role="status"
      class="alert"
      :class="isOnline ? 'alert-success' : 'alert-warning'"
    >
      <Wifi
        v-if="isOnline"
        :size="20"
      />
      <WifiOff
        v-else
        :size="20"
      />
      <div>
        <p class="font-medium">
          {{ isOnline ? t('networkOnline') : t('networkOffline') }}
        </p>
        <p class="text-sm">
          {{ connectionDescription }}
        </p>
      </div>
    </div>

    <div class="join join-vertical w-full">
      <details
        open
        class="collapse collapse-arrow join-item group border border-base-300 bg-base-100"
      >
        <summary class="collapse-title bg-base-200/70 font-semibold group-open:bg-primary/10 group-open:text-primary">
          <span class="flex items-center gap-3">
            <BookOpen :size="20" />
            {{ t('settingsLearningSection') }}
          </span>
        </summary>
        <div class="collapse-content">
          <div class="flex flex-col gap-6 pt-1">
            <!-- Mobile-solvable Exercise Filter -->
            <label class="flex items-start gap-4 cursor-pointer">
              <div class="flex-1">
                <p class="font-medium">
                  {{ t('mobileSolvableOnly') }}
                </p>
                <p class="text-sm text-base-content/60 mt-0.5">
                  {{ t('mobileSolvableOnlyHint') }}
                </p>
              </div>
              <input
                v-model="mobileSolvableOnly"
                type="checkbox"
                class="toggle toggle-primary mt-0.5 shrink-0"
              >
            </label>

            <!-- Mode Selection -->
            <div class="flex flex-col gap-2">
              <p class="font-medium">
                {{ t('mode') }}
              </p>
              <div class="flex gap-2">
                <button
                  v-for="m in modes"
                  :key="m.code"
                  type="button"
                  class="px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors flex-1"
                  :class="mode === m.code
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-base-300 hover:border-base-content/30'"
                  @click="mode = m.code"
                >
                  {{ m.label }}
                </button>
              </div>
              <p
                v-if="mode === 'exam'"
                class="text-sm text-accent font-medium"
              >
                {{ t('examModeInfo') }}
              </p>
              <p
                v-if="mode === 'exam'"
                class="text-sm text-base-content/60"
              >
                {{ t('examModeCategoryHint') }}
              </p>
            </div>

            <!-- Exam Question Count (only in exam mode) -->
            <div
              v-if="mode === 'exam'"
              class="flex flex-col gap-3"
            >
              <div class="flex justify-between items-baseline">
                <p class="font-medium">
                  {{ t('examQuestionCount') }}
                </p>
                <p class="text-sm font-semibold text-accent">
                  {{ examQuestionCount }}
                </p>
              </div>
              <input
                v-model.number="examQuestionCount"
                type="range"
                min="5"
                max="100"
                step="5"
                class="range range-accent w-full"
              >
            </div>

            <!-- Auto Advance Toggle -->
            <label
              class="flex items-start gap-4 cursor-pointer"
              :class="{ 'opacity-50 cursor-not-allowed': autoAdvanceDisabled }"
            >
              <div class="flex-1">
                <p class="font-medium">
                  {{ t('autoAdvance') }}
                </p>
                <p class="text-sm text-base-content/60 mt-0.5">
                  {{ t('autoAdvanceHint') }}
                </p>
              </div>
              <input
                v-model="autoAdvance"
                type="checkbox"
                class="toggle toggle-primary mt-0.5 shrink-0"
                :disabled="autoAdvanceDisabled"
              >
            </label>

            <!-- Timeout Settings (only show if auto advance enabled) -->
            <template v-if="autoAdvance">
              <!-- Correct Answer Timeout -->
              <div class="flex flex-col gap-3">
                <div class="flex justify-between items-baseline">
                  <p class="font-medium">
                    {{ t('timeoutCorrect') }}
                  </p>
                  <p class="text-sm font-semibold text-primary">
                    {{ formatSeconds(timeoutCorrect / 1000) }}
                  </p>
                </div>
                <input
                  v-model.number="timeoutCorrect"
                  type="range"
                  min="500"
                  max="20000"
                  step="500"
                  class="range range-primary w-full"
                >
              </div>

              <!-- Incorrect Answer Timeout -->
              <div class="flex flex-col gap-3">
                <div class="flex justify-between items-baseline">
                  <p class="font-medium">
                    {{ t('timeoutIncorrect') }}
                  </p>
                  <p class="text-sm font-semibold text-primary">
                    {{ formatSeconds(timeoutIncorrect / 1000) }}
                  </p>
                </div>
                <input
                  v-model.number="timeoutIncorrect"
                  type="range"
                  min="500"
                  max="20000"
                  step="500"
                  class="range range-primary w-full"
                >
              </div>
            </template>

            <!-- Learning level -->
            <div class="flex flex-col gap-3">
              <div>
                <div class="flex items-baseline justify-between gap-3">
                  <label
                    for="learning-level"
                    class="font-medium"
                  >
                    {{ t('learningLevel') }}
                  </label>
                  <span class="text-sm font-semibold text-primary text-right">
                    {{ learningLevelDisplay }}
                  </span>
                </div>
                <p class="text-sm text-base-content/60 mt-1">
                  {{ t('learningLevelHint') }}
                </p>
              </div>
              <input
                id="learning-level"
                :value="learningLevel"
                type="range"
                min="1"
                max="10"
                step="1"
                class="range range-primary w-full"
                @input="setLearningLevel(Number(($event.target as HTMLInputElement).value))"
              >
              <div
                class="flex justify-between px-1"
                aria-hidden="true"
              >
                <span
                  v-for="level in learningLevelDefinitions"
                  :key="level.value"
                  class="flex flex-col items-center gap-1 text-[0.65rem]"
                  :class="level.value === learningLevel ? 'text-primary font-semibold' : 'text-base-content/40'"
                >
                  <span class="size-1.5 rounded-full bg-current" />
                  {{ level.value }}
                </span>
              </div>
              <p class="text-xs text-base-content/50">
                {{ t('learningLevelRecommendation', {
                  attempted: learningLevelAssessment.attemptedCards,
                  required: learningLevelAssessment.requiredCards,
                  accuracy: Math.round(learningLevelAssessment.recentAccuracy * 100),
                }) }}
              </p>
            </div>

            <label class="flex items-start gap-4 cursor-pointer">
              <div class="flex-1">
                <p class="font-medium">
                  {{ t('automaticLevelProgression') }}
                </p>
                <p class="text-sm text-base-content/60 mt-0.5">
                  {{ t('automaticLevelProgressionHint') }}
                </p>
              </div>
              <input
                v-model="automaticLevelProgression"
                type="checkbox"
                class="toggle toggle-primary mt-0.5 shrink-0"
              >
            </label>
          </div>
        </div>
      </details>

      <details class="collapse collapse-arrow join-item group border border-base-300 bg-base-100">
        <summary class="collapse-title bg-base-200/70 font-semibold group-open:bg-primary/10 group-open:text-primary">
          <span class="flex items-center gap-3">
            <MonitorCog :size="20" />
            {{ t('settingsUiSection') }}
          </span>
        </summary>
        <div class="collapse-content">
          <div class="flex flex-col gap-6 pt-1">
            <!-- Sound Toggle -->
            <label class="flex items-start gap-4 cursor-pointer">
              <div class="flex-1">
                <p class="font-medium">
                  {{ t('soundEnabled') }}
                </p>
                <p class="text-sm text-base-content/60 mt-0.5">
                  {{ t('soundEnabledHint') }}
                </p>
              </div>
              <input
                v-model="soundEnabled"
                type="checkbox"
                class="toggle toggle-primary mt-0.5 shrink-0"
              >
            </label>

            <!-- Haptic Feedback Toggle -->
            <label class="flex items-start gap-4 cursor-pointer">
              <div class="flex-1">
                <p class="font-medium">
                  {{ t('hapticEnabled') }}
                </p>
                <p class="text-sm text-base-content/60 mt-0.5">
                  {{ t('hapticEnabledHint') }}
                </p>
              </div>
              <input
                v-model="hapticEnabled"
                type="checkbox"
                class="toggle toggle-primary mt-0.5 shrink-0"
              >
            </label>

            <!-- Language Selection -->
            <div class="flex flex-col gap-2">
              <p class="font-medium">
                {{ t('language') }}
              </p>
              <div class="flex gap-2">
                <button
                  v-for="lang in languages"
                  :key="lang.code"
                  type="button"
                  class="px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors flex-1"
                  :class="language === lang.code
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-base-300 hover:border-base-content/30'"
                  @click="language = lang.code"
                >
                  {{ lang.label }}
                </button>
              </div>
            </div>

            <!-- Theme Selection -->
            <div class="flex flex-col gap-2">
              <p class="font-medium">
                {{ t('theme') }}
              </p>
              <div class="flex gap-2">
                <button
                  v-for="th in [{ code: 'auto', label: t('themeAuto') }, { code: 'abschluss-light', label: t('themeLight') }, { code: 'abschluss-dark', label: t('themeDark') }]"
                  :key="th.code"
                  type="button"
                  class="px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors flex-1"
                  :class="theme === th.code
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-base-300 hover:border-base-content/30'"
                  @click="theme = th.code"
                >
                  {{ th.label }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </details>

      <details class="collapse collapse-arrow join-item group border border-base-300 bg-base-100">
        <summary class="collapse-title bg-base-200/70 font-semibold group-open:bg-primary/10 group-open:text-primary">
          <span class="flex items-center gap-3">
            <UserRound :size="20" />
            {{ t('settingsProfileSection') }}
          </span>
        </summary>
        <div class="collapse-content">
          <div class="flex flex-col gap-6 pt-1">
            <!-- Specialization -->
            <div class="flex flex-col gap-2">
              <label
                for="specialization"
                class="font-medium"
              >
                {{ t('specialization') }}
              </label>
              <select
                id="specialization"
                v-model="specialization"
                class="select select-bordered w-full"
              >
                <option
                  v-for="code in specializations"
                  :key="code"
                  :value="code"
                >
                  {{ t(specializationLabelKeys[code]) }}
                </option>
              </select>
              <p class="text-sm text-base-content/60">
                {{ t('specializationHint') }}
              </p>
            </div>

            <!-- Exercise Source -->
            <div class="flex flex-col gap-2">
              <div>
                <p class="font-medium">
                  {{ t('exerciseSource') }}
                </p>
                <p class="text-sm text-base-content/60 mt-0.5">
                  {{ t('exerciseSourceHint') }}
                </p>
              </div>
              <label class="flex items-center gap-3">
                <span
                  class="text-sm"
                  :class="{ 'font-medium text-primary': exerciseSource === 'json' }"
                >
                  {{ t('exerciseSourceJson') }}
                </span>
                <input
                  v-model="apiExerciseSourceEnabled"
                  type="checkbox"
                  class="toggle toggle-primary"
                  :aria-label="t('exerciseSource')"
                >
                <span
                  class="text-sm"
                  :class="{ 'font-medium text-primary': exerciseSource === 'api' }"
                >
                  {{ t('exerciseSourceApi') }}
                </span>
              </label>
              <p
                v-if="exerciseSource === 'api'"
                class="text-xs text-warning"
              >
                {{ t('exerciseSourceApiHint') }}
              </p>
            </div>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>
