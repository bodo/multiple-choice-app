<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bookmark } from 'lucide-vue-next'
import { useExercises } from '../../entities/exercise/useExercises'
import { useExerciseFlow } from './useExerciseFlow'
import { useSwipe } from '../../utils/useSwipe'
import { getCurrentStreak, getLongestStreak } from '../../entities/exercise/useExerciseHistory'
import { useBookmarks } from '../../entities/exercise/useBookmarks'
import QuestionSection from './QuestionSection.vue'
import AnswerSection from './AnswerSection.vue'

const { t } = useI18n()
const { exercises, isLoading } = useExercises()
const { phase, currentExercise, currentIndex, totalExercises, lastResult, submitAnswer, advance, totalAnswered, accuracy, averageTimeSeconds } = useExerciseFlow(exercises)

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
        <span class="text-sm font-medium text-base-content/70">{{ t('question') }} {{ currentIndex + 1 }} {{ t('of') }} {{ totalExercises }}</span>
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
          <span class="text-xs text-base-content/50">{{ Math.round((currentIndex + 1) / totalExercises * 100) }}%</span>
        </div>
      </div>
      <progress class="progress progress-primary w-full" :value="currentIndex + 1" :max="totalExercises" />
      <div v-if="totalAnswered > 0" class="flex gap-4 mt-2 text-xs text-base-content/50">
        <span>{{ t('accuracy') }}: {{ accuracy }}%</span>
        <span>{{ t('avgTime') }}: {{ averageTimeSeconds.toFixed(1) }}s</span>
        <span>{{ t('streak') }}: {{ currentStreakDisplay }} <span v-if="longestStreakDisplay > 0" class="text-base-content/30">({{ t('longestStreak') }}: {{ longestStreakDisplay }})</span></span>
      </div>
    </div>

    <!-- Question + Answer side-by-side on landscape/desktop, stacked on mobile -->
    <div class="flex flex-col landscape:flex-row flex-1 overflow-hidden">
      <div class="landscape:w-1/2 overflow-y-auto p-4">
        <QuestionSection :exercise="currentExercise" />
      </div>
      <div class="landscape:w-1/2 overflow-y-auto flex flex-col items-end p-4 gap-3">
        <AnswerSection
          :exercise="currentExercise"
          :phase="phase"
          :result="lastResult"
          @submitted="submitAnswer"
          @advance="advance"
        />
        <button
          v-if="phase === 'submitted'"
          type="button"
          class="btn btn-primary"
          @click="advance"
        >
          {{ t('next') }}
        </button>
      </div>
    </div>
  </div>
</template>
