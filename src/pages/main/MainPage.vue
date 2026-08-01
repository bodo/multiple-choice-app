<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bookmark, CircleAlert, ShieldAlert, Sparkles, Undo2 } from 'lucide-vue-next'
import { useExercises } from '../../entities/exercise/useExercises'
import { useExerciseFlow } from './useExerciseFlow'
import { useSettings } from '../../entities/settings/useSettings'
import { useSwipe } from '../../utils/useSwipe'
import {
  getCurrentStreak,
  getLongestStreak,
  isExerciseWeakspot,
  markExerciseAsWeakspot,
  openWeakspotCount,
  returnWeakspotToTraining,
} from '../../entities/exercise/useExerciseHistory'
import { useBookmarks } from '../../entities/exercise/useBookmarks'
import QuestionSection from './QuestionSection.vue'
import AnswerSection from './AnswerSection.vue'
import FlashCard from './FlashCard.vue'
import ExplainBack from './ExplainBack.vue'
import { useDailyGoal } from '../../entities/daily-goal/dailyGoalService'
import { learningLevelDefinitions } from '../../entities/exercise/learningLevel'

const { t } = useI18n()
const { isLoading, error } = useExercises()
const { phase, currentExercise, lastResult, submitAnswer, advance, startExam, totalAnswered, totalCorrect, accuracy, averageTimeSeconds, isExamFinished, examTotal, newWeakspotExerciseId, examNewWeakspotCount, newLearningLevel } = useExerciseFlow()
const { mode } = useSettings()
const { progress: dailyGoal } = useDailyGoal()
const examQuestionNumber = computed(() => Math.min(
  examTotal.value,
  totalAnswered.value + (phase.value === 'answering' ? 1 : 0),
))

const { bookmarks, toggleBookmark } = useBookmarks()
const isCurrentBookmarked = computed(() => currentExercise.value ? bookmarks.value.has(currentExercise.value.id) : false)
const isCurrentWeakspot = computed(() => currentExercise.value
  ? isExerciseWeakspot(currentExercise.value.id)
  : false)
const manualWeakspotExerciseId = ref<string | null>(null)

async function markCurrentAsWeakspot() {
  const exerciseId = currentExercise.value?.id
  if (!exerciseId) return
  const changed = await markExerciseAsWeakspot(exerciseId)
  if (changed) manualWeakspotExerciseId.value = exerciseId
}

async function undoManualWeakspot() {
  if (!manualWeakspotExerciseId.value) return
  await returnWeakspotToTraining(manualWeakspotExerciseId.value)
  manualWeakspotExerciseId.value = null
}

const currentStreakDisplay = computed(() => getCurrentStreak())
const longestStreakDisplay = computed(() => getLongestStreak())

// aria-live announcement for screen readers
const liveAnnouncement = computed(() => {
  if (!lastResult.value) return ''
  return lastResult.value.isCorrect ? t('correct') : t('incorrect')
})

function formatPercent(value: number): string {
  return `${value}%`
}

function formatSeconds(value: number): string {
  return `${value.toFixed(1)}s`
}

function formatLabeledValue(label: string, value: string | number): string {
  return `${label}: ${value}`
}

function formatParenthetical(value: string): string {
  return `(${value})`
}

function formatDailyGoal(completed: number, target: number): string {
  return `${t('dailyGoal')}: ${completed} ${t('of')} ${target}`
}

function formatBoxCount(box: number, count: number): string {
  return `B${box}: ${count}`
}

function learningLevelLabel(level: number): string {
  const definition = learningLevelDefinitions.find(entry => entry.value === level)
  return definition ? t(definition.labelKey) : String(level)
}

// Detect landscape vs portrait to avoid mounting duplicate input components
const isLandscape = ref(window.matchMedia('(orientation: landscape)').matches)
let mql: MediaQueryList
onMounted(() => {
  mql = window.matchMedia('(orientation: landscape)')
  const handler = (e: MediaQueryListEvent) => { isLandscape.value = e.matches }
  mql.addEventListener('change', handler)
  onUnmounted(() => mql.removeEventListener('change', handler))
})

// Global Enter to advance when submitted (input components unmount on desktop)
let submitTime = 0
watch(phase, (p) => { if (p === 'submitted') submitTime = Date.now() })
function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.repeat && phase.value === 'submitted' && Date.now() - submitTime > 500) {
    e.preventDefault()
    advance()
  }
}
onMounted(() => window.addEventListener('keydown', handleGlobalKeyDown))
onUnmounted(() => window.removeEventListener('keydown', handleGlobalKeyDown))

// Swipe left to advance after submitting
useSwipe((dir) => {
  if (dir === 'left' && phase.value === 'submitted') {
    advance()
  }
})
</script>

<template>
  <div
    v-if="isLoading"
    class="h-full flex items-center justify-center"
  >
    <span class="loading loading-spinner loading-lg" />
    <span class="ml-3">{{ t('loading') }}</span>
  </div>

  <div
    v-else-if="error && !currentExercise"
    class="h-full p-6 flex items-center justify-center"
  >
    <div
      role="alert"
      class="alert alert-error max-w-lg"
    >
      <CircleAlert :size="20" />
      <div>
        <p class="font-medium">
          {{ t('exerciseLoadFailed') }}
        </p>
        <p class="text-sm">
          {{ error }}
        </p>
      </div>
    </div>
  </div>

  <div
    v-else-if="!currentExercise"
    class="h-full flex flex-col items-center justify-center gap-4 p-6 text-base-content/60"
  >
    <p>{{ openWeakspotCount > 0 ? t('allActiveExercisesPaused') : t('noExercises') }}</p>
    <div
      v-if="manualWeakspotExerciseId"
      role="status"
      class="alert alert-info max-w-lg"
    >
      <ShieldAlert :size="20" />
      <span class="flex-1">{{ t('weakspotMarkedManually') }}</span>
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        @click="undoManualWeakspot"
      >
        <Undo2 :size="16" />
        {{ t('undo') }}
      </button>
    </div>
    <RouterLink
      v-else-if="openWeakspotCount > 0"
      class="btn btn-warning btn-sm"
      to="/stats?tab=weakspots"
    >
      <ShieldAlert :size="16" />
      {{ t('viewWeakspots') }}
      <span class="badge badge-sm">{{ openWeakspotCount }}</span>
    </RouterLink>
  </div>

  <div
    v-else
    class="flex flex-col h-full"
  >
    <!-- Screen reader announcements -->
    <div
      class="sr-only"
      aria-live="assertive"
      aria-atomic="true"
    >
      {{ liveAnnouncement }}
    </div>

    <div
      v-if="newWeakspotExerciseId"
      role="alert"
      class="alert alert-warning mx-4 mt-4"
    >
      <ShieldAlert :size="20" />
      <div class="flex-1">
        <p class="font-medium">
          {{ t('weakspotAutomaticTitle') }}
        </p>
        <p class="text-sm">
          {{ t('weakspotAutomaticHint') }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          class="btn btn-sm btn-ghost"
          to="/stats?tab=weakspots"
        >
          {{ t('viewWeakspots') }}
        </RouterLink>
        <button
          type="button"
          class="btn btn-sm btn-primary"
          @click="advance"
        >
          {{ t('next') }}
        </button>
      </div>
    </div>

    <div
      v-else-if="manualWeakspotExerciseId"
      role="status"
      class="alert alert-info mx-4 mt-4"
    >
      <ShieldAlert :size="20" />
      <span class="flex-1">{{ t('weakspotMarkedManually') }}</span>
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        @click="undoManualWeakspot"
      >
        <Undo2 :size="16" />
        {{ t('undo') }}
      </button>
    </div>

    <div
      v-else-if="newLearningLevel"
      role="status"
      class="alert alert-success mx-4 mt-4"
    >
      <Sparkles :size="20" />
      <div class="flex-1">
        <p class="font-medium">
          {{ t('learningLevelAdvanced') }}
        </p>
        <p class="text-sm">
          {{ t('learningLevelAdvancedHint', { level: newLearningLevel, name: learningLevelLabel(newLearningLevel) }) }}
        </p>
      </div>
      <button
        type="button"
        class="btn btn-sm btn-primary"
        @click="advance"
      >
        {{ t('next') }}
      </button>
    </div>

    <div
      v-else-if="openWeakspotCount > 0 && mode !== 'exam'"
      class="alert mx-4 mt-4 py-2"
    >
      <ShieldAlert :size="18" />
      <span class="text-sm">{{ t('openWeakspotCount', { count: openWeakspotCount }) }}</span>
      <RouterLink
        class="btn btn-sm btn-ghost"
        to="/stats?tab=weakspots"
      >
        {{ t('viewWeakspots') }}
      </RouterLink>
    </div>

    <!-- Progress bar (always full width on top) -->
    <div class="w-full px-4 pt-4 pb-2 flex-shrink-0">
      <div class="flex items-center justify-between mb-2">
        <span
          v-if="mode === 'exam'"
          class="text-sm font-medium text-accent"
        >
          {{ t('examQuestion') }} {{ examQuestionNumber }} {{ t('of') }} {{ examTotal }}
        </span>
        <span
          v-else
          class="text-sm font-medium text-base-content/70"
        >
          {{ formatDailyGoal(dailyGoal.completed, dailyGoal.target) }}
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="p-1 rounded transition-colors"
            :class="isCurrentBookmarked ? 'text-warning' : 'text-base-content/30 hover:text-base-content/60'"
            :aria-label="isCurrentBookmarked ? t('removeBookmark') : t('addBookmark')"
            @click="currentExercise && toggleBookmark(currentExercise.id)"
          >
            <Bookmark
              :size="16"
              :fill="isCurrentBookmarked ? 'currentColor' : 'none'"
            />
          </button>
          <button
            type="button"
            class="p-1 rounded transition-colors"
            :class="isCurrentWeakspot ? 'text-warning' : 'text-base-content/30 hover:text-warning'"
            :disabled="isCurrentWeakspot"
            :aria-label="isCurrentWeakspot ? t('alreadyWeakspot') : t('markWeakspot')"
            @click="markCurrentAsWeakspot"
          >
            <ShieldAlert
              :size="16"
              :fill="isCurrentWeakspot ? 'currentColor' : 'none'"
            />
          </button>
          <span
            v-if="mode !== 'exam'"
            class="text-xs text-base-content/50"
          >{{ formatPercent(dailyGoal.percentage) }}</span>
        </div>
      </div>
      <progress
        class="progress w-full"
        :class="mode === 'exam' ? 'progress-accent' : 'progress-primary'"
        :value="mode === 'exam' ? examQuestionNumber : dailyGoal.completed"
        :max="mode === 'exam' ? examTotal : dailyGoal.target"
      />
      <div
        v-if="mode !== 'exam'"
        class="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-base-content/50"
      >
        <span
          v-for="box in 5"
          :key="box"
        >{{ formatBoxCount(box, dailyGoal.boxCounts[box]) }}</span>
      </div>
      <div
        v-if="totalAnswered > 0"
        class="flex gap-4 mt-2 text-xs text-base-content/50"
      >
        <span>{{ formatLabeledValue(t('accuracy'), formatPercent(accuracy)) }}</span>
        <span>{{ formatLabeledValue(t('avgTime'), formatSeconds(averageTimeSeconds)) }}</span>
        <span v-if="mode !== 'exam'">{{ formatLabeledValue(t('streak'), currentStreakDisplay) }} <span
          v-if="longestStreakDisplay > 0"
          class="text-base-content/30"
        >{{ formatParenthetical(formatLabeledValue(t('longestStreak'), longestStreakDisplay)) }}</span></span>
      </div>
    </div>

    <!-- Exam finished screen -->
    <div
      v-if="isExamFinished"
      class="flex-1 flex flex-col items-center justify-center gap-4 p-6"
    >
      <h2 class="text-2xl font-bold">
        {{ t('examFinished') }}
      </h2>
      <div class="grid grid-cols-2 gap-4 max-w-xs w-full">
        <div class="rounded-lg bg-success/10 border border-success p-4 text-center">
          <p class="text-3xl font-bold text-success">
            {{ totalCorrect }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsTotalCorrect') }}
          </p>
        </div>
        <div class="rounded-lg bg-error/10 border border-error p-4 text-center">
          <p class="text-3xl font-bold text-error">
            {{ totalAnswered - totalCorrect }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsTotalWrong') }}
          </p>
        </div>
        <div class="rounded-lg bg-base-200 p-4 text-center">
          <p class="text-3xl font-bold">
            {{ formatPercent(accuracy) }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('accuracy') }}
          </p>
        </div>
        <div class="rounded-lg bg-base-200 p-4 text-center">
          <p class="text-3xl font-bold">
            {{ formatSeconds(averageTimeSeconds) }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('avgTime') }}
          </p>
        </div>
      </div>
      <button
        type="button"
        class="btn btn-primary mt-4"
        @click="startExam"
      >
        {{ t('restartExam') }}
      </button>
      <div
        v-if="examNewWeakspotCount > 0"
        class="alert alert-warning max-w-md"
      >
        <ShieldAlert :size="20" />
        <span>{{ t('examWeakspotsAdded', { count: examNewWeakspotCount }) }}</span>
        <RouterLink
          class="btn btn-sm btn-ghost"
          to="/stats?tab=weakspots"
        >
          {{ t('viewWeakspots') }}
        </RouterLink>
      </div>
    </div>

    <!-- Landscape/desktop: side-by-side, right column swaps on submit -->
    <div
      v-if="!isExamFinished && isLandscape"
      class="flex flex-row flex-1 overflow-hidden"
    >
      <div class="w-1/2 overflow-y-auto p-4">
        <QuestionSection :exercise="currentExercise" />
      </div>
      <div class="w-1/2 overflow-y-auto flex flex-col items-end p-4 gap-3">
        <AnswerSection
          v-if="phase !== 'submitted'"
          :exercise="currentExercise"
          :phase="phase"
          :result="lastResult"
          @submitted="submitAnswer"
          @advance="advance"
        />
        <template v-else-if="lastResult">
          <ExplainBack
            :exercise="currentExercise"
            :result="lastResult"
          />
          <button
            type="button"
            class="btn btn-primary"
            @click="advance"
          >
            {{ t('next') }}
          </button>
        </template>
      </div>
    </div>

    <!-- Portrait/mobile: swap front/back -->
    <FlashCard
      v-if="!isExamFinished && !isLandscape"
      :flipped="phase === 'submitted'"
    >
      <template #front>
        <div class="p-4">
          <QuestionSection :exercise="currentExercise" />
        </div>
        <div class="flex flex-col items-end p-4 gap-3">
          <AnswerSection
            :exercise="currentExercise"
            :phase="phase"
            :result="lastResult"
            @submitted="submitAnswer"
            @advance="advance"
          />
        </div>
      </template>
      <template #back>
        <ExplainBack
          v-if="lastResult"
          :exercise="currentExercise"
          :result="lastResult"
        />
        <div class="p-4 flex justify-end">
          <button
            type="button"
            class="btn btn-primary"
            @click="advance"
          >
            {{ t('next') }}
          </button>
        </div>
      </template>
    </FlashCard>
  </div>
</template>
