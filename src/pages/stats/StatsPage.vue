<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getStats, getCurrentStreak, getLongestStreak } from '../../entities/exercise/useExerciseHistory'

const { t } = useI18n()

const stats = ref(getStats())
const current = ref(getCurrentStreak())
const longest = ref(getLongestStreak())

onMounted(() => {
  stats.value = getStats()
  current.value = getCurrentStreak()
  longest.value = getLongestStreak()
})

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}
</script>

<template>
  <div class="p-6 max-w-lg flex flex-col gap-6 h-full overflow-y-auto">
    <h1 class="text-xl font-semibold">
      {{ t('statsTitle') }}
    </h1>

    <!-- Streak highlight -->
    <div class="flex gap-4">
      <div class="flex-1 rounded-lg bg-primary/10 border border-primary p-4 text-center">
        <p class="text-3xl font-bold text-primary">
          {{ current }}
        </p>
        <p class="text-sm text-base-content/60 mt-1">
          {{ t('currentStreak') }}
        </p>
      </div>
      <div class="flex-1 rounded-lg bg-success/10 border border-success p-4 text-center">
        <p class="text-3xl font-bold text-success">
          {{ longest }}
        </p>
        <p class="text-sm text-base-content/60 mt-1">
          {{ t('longestStreak') }}
        </p>
      </div>
    </div>

    <!-- Questions -->
    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-medium">
        {{ t('statsQuestions') }}
      </h2>
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">
            {{ stats.totalQuestions }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsTotalAnswered') }}
          </p>
        </div>
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">
            {{ stats.totalAccuracy }}%
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsOverallAccuracy') }}
          </p>
        </div>
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">
            {{ stats.totalCorrect }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsTotalCorrect') }}
          </p>
        </div>
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">
            {{ stats.totalQuestions - stats.totalCorrect }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsTotalWrong') }}
          </p>
        </div>
      </div>
    </div>

    <!-- Streaks -->
    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-medium">
        {{ t('statsStreaks') }}
      </h2>
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">
            {{ stats.totalStreaks }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsTotalStreaks') }}
          </p>
        </div>
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">
            {{ stats.averageStreak }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsAvgStreak') }}
          </p>
        </div>
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">
            {{ stats.shortestStreak }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsShortestStreak') }}
          </p>
        </div>
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">
            {{ stats.longestStreak }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsLongestStreak') }}
          </p>
        </div>
      </div>
    </div>

    <!-- Sessions -->
    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-medium">
        {{ t('statsSessions') }}
      </h2>
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">
            {{ stats.totalSessions }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsTotalSessions') }}
          </p>
        </div>
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">
            {{ stats.uniqueDays }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsDaysPracticed') }}
          </p>
        </div>
        <div class="rounded-lg bg-base-200 p-3 col-span-2">
          <p class="text-xl font-bold">
            {{ formatDuration(stats.totalDurationMs) }}
          </p>
          <p class="text-xs text-base-content/60">
            {{ t('statsTotalTime') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
