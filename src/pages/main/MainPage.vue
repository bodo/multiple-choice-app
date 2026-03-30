<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bookmark } from 'lucide-vue-next'
import { useExercises } from '../../entities/exercise/useExercises'
import { useExerciseFlow } from './useExerciseFlow'
import { useSettings } from '../../entities/settings/useSettings'
import { useSwipe } from '../../utils/useSwipe'
import { getCurrentStreak, getLongestStreak } from '../../entities/exercise/useExerciseHistory'
import { useBookmarks } from '../../entities/exercise/useBookmarks'
import QuestionSection from './QuestionSection.vue'
import AnswerSection from './AnswerSection.vue'
import FlashCard from './FlashCard.vue'
import ExplainBack from './ExplainBack.vue'

const { t } = useI18n()
const { isLoading } = useExercises()
const { phase, currentExercise, currentIndex, totalExercises, lastResult, submitAnswer, advance, startExam, totalAnswered, totalCorrect, accuracy, averageTimeSeconds, isExamFinished, examTotal } = useExerciseFlow()
const { mode } = useSettings()

const { bookmarks, toggleBookmark } = useBookmarks()
const isCurrentBookmarked = computed(() => currentExercise.value ? bookmarks.value.has(currentExercise.value.id) : false)

const currentStreakDisplay = ref(getCurrentStreak())
const longestStreakDisplay = ref(getLongestStreak())
watch(totalAnswered, () => {
  currentStreakDisplay.value = getCurrentStreak()
  longestStreakDisplay.value = getLongestStreak()
})

// aria-live announcement for screen readers
const liveAnnouncement = computed(() => {
  if (!lastResult.value) return ''
  return lastResult.value.isCorrect ? t('correct') : t('incorrect')
})

// Swipe left to advance after submitting
useSwipe((dir) => {
  if (dir === 'left' && phase.value === 'submitted') {
    advance()
  }
})
</script>

<template>
  <div
    v-if="isLoading || !currentExercise"
    class="h-full flex items-center justify-center"
  >
    <span class="loading loading-spinner loading-lg" />
    <span class="ml-3">{{ t('loading') }}</span>
  </div>

  <div
    v-else
    class="flex flex-col h-full overflow-hidden"
  >
    <!-- Screen reader announcements -->
    <div class="sr-only" aria-live="assertive" aria-atomic="true">
      {{ liveAnnouncement }}
    </div>

    <!-- Progress bar (always full width on top) -->
    <div class="w-full px-4 pt-4 pb-2 flex-shrink-0">
      <div class="flex items-center justify-between mb-2">
        <span v-if="mode === 'exam'" class="text-sm font-medium text-accent">
          {{ t('examQuestion') }} {{ totalAnswered + (phase === 'submitted' ? 0 : 1) }} {{ t('of') }} {{ examTotal }}
        </span>
        <span v-else class="text-sm font-medium text-base-content/70">
          {{ t('question') }} {{ currentIndex + 1 }} {{ t('of') }} {{ totalExercises }}
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="p-1 rounded transition-colors"
            :class="isCurrentBookmarked ? 'text-warning' : 'text-base-content/30 hover:text-base-content/60'"
            :aria-label="isCurrentBookmarked ? t('removeBookmark') : t('addBookmark')"
            @click="currentExercise && toggleBookmark(currentExercise.id)"
          >
            <Bookmark :size="16" :fill="isCurrentBookmarked ? 'currentColor' : 'none'" />
          </button>
          <span v-if="mode !== 'exam'" class="text-xs text-base-content/50">{{ Math.round((currentIndex + 1) / totalExercises * 100) }}%</span>
        </div>
      </div>
      <progress
        class="progress w-full"
        :class="mode === 'exam' ? 'progress-accent' : 'progress-primary'"
        :value="mode === 'exam' ? totalAnswered + (phase === 'submitted' ? 0 : 1) : currentIndex + 1"
        :max="mode === 'exam' ? examTotal : totalExercises"
      />
      <div v-if="totalAnswered > 0" class="flex gap-4 mt-2 text-xs text-base-content/50">
        <span>{{ t('accuracy') }}: {{ accuracy }}%</span>
        <span>{{ t('avgTime') }}: {{ averageTimeSeconds.toFixed(1) }}s</span>
        <span v-if="mode !== 'exam'">{{ t('streak') }}: {{ currentStreakDisplay }} <span v-if="longestStreakDisplay > 0" class="text-base-content/30">({{ t('longestStreak') }}: {{ longestStreakDisplay }})</span></span>
      </div>
    </div>

    <!-- Exam finished screen -->
    <div v-if="isExamFinished" class="flex-1 flex flex-col items-center justify-center gap-4 p-6">
      <h2 class="text-2xl font-bold">{{ t('examFinished') }}</h2>
      <div class="grid grid-cols-2 gap-4 max-w-xs w-full">
        <div class="rounded-lg bg-success/10 border border-success p-4 text-center">
          <p class="text-3xl font-bold text-success">{{ totalCorrect }}</p>
          <p class="text-xs text-base-content/60">{{ t('statsTotalCorrect') }}</p>
        </div>
        <div class="rounded-lg bg-error/10 border border-error p-4 text-center">
          <p class="text-3xl font-bold text-error">{{ totalAnswered - totalCorrect }}</p>
          <p class="text-xs text-base-content/60">{{ t('statsTotalWrong') }}</p>
        </div>
        <div class="rounded-lg bg-base-200 p-4 text-center">
          <p class="text-3xl font-bold">{{ accuracy }}%</p>
          <p class="text-xs text-base-content/60">{{ t('accuracy') }}</p>
        </div>
        <div class="rounded-lg bg-base-200 p-4 text-center">
          <p class="text-3xl font-bold">{{ averageTimeSeconds.toFixed(1) }}s</p>
          <p class="text-xs text-base-content/60">{{ t('avgTime') }}</p>
        </div>
      </div>
      <button type="button" class="btn btn-primary mt-4" @click="startExam">
        {{ t('restartExam') }}
      </button>
    </div>

    <!-- Landscape/desktop: side-by-side, right column swaps on submit -->
    <div v-if="!isExamFinished" class="hidden landscape:flex flex-row flex-1 overflow-hidden">
      <div class="w-1/2 overflow-y-auto p-4">
        <QuestionSection :exercise="currentExercise" />
      </div>
      <div class="w-1/2 overflow-y-auto flex flex-col items-end p-4 gap-3">
        <template v-if="phase !== 'submitted'">
          <AnswerSection
            :exercise="currentExercise"
            :phase="phase"
            :result="lastResult"
            @submitted="submitAnswer"
            @advance="advance"
          />
        </template>
        <template v-else>
          <ExplainBack v-if="lastResult" :exercise="currentExercise" :result="lastResult" />
          <button type="button" class="btn btn-primary" @click="advance">
            {{ t('next') }}
          </button>
        </template>
      </div>
    </div>

    <!-- Portrait/mobile: flashcard flip -->
    <FlashCard v-if="!isExamFinished" class="landscape:hidden flex-1 overflow-hidden" :flipped="phase === 'submitted'">
      <template #front>
        <div class="flex flex-col h-full overflow-y-auto">
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
        </div>
      </template>
      <template #back>
        <div class="flex flex-col h-full overflow-y-auto">
          <ExplainBack v-if="lastResult" :exercise="currentExercise" :result="lastResult" />
          <div class="p-4 flex justify-end">
            <button type="button" class="btn btn-primary" @click="advance">
              {{ t('next') }}
            </button>
          </div>
        </div>
      </template>
    </FlashCard>
  </div>
</template>
