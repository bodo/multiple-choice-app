<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getStats, getCurrentStreak, getLongestStreak, getRank,
  getMasteryDistribution, getWeakestExercises, getCategoryAccuracy,
} from '../../entities/exercise/useExerciseHistory'
import { useExercises } from '../../entities/exercise/useExercises'

useI18n()
const { exercises } = useExercises()

const tab = ref<'scorecard' | 'weakspots' | 'mastery'>('scorecard')
const tabs = [
  { key: 'scorecard' as const, label: 'tab_scorecard' },
  { key: 'weakspots' as const, label: 'tab_weakspots' },
  { key: 'mastery' as const, label: 'tab_mastery' },
]

const stats = ref(getStats())
const current = ref(getCurrentStreak())
const longest = ref(getLongestStreak())
const rank = ref(getRank())
const mastery = ref(getMasteryDistribution())
const weakest = ref(getWeakestExercises(10))
const categoryAcc = ref<Array<{ tag: string; accuracy: number; total: number }>>([])

onMounted(() => {
  stats.value = getStats()
  current.value = getCurrentStreak()
  longest.value = getLongestStreak()
  rank.value = getRank()
  mastery.value = getMasteryDistribution()
  weakest.value = getWeakestExercises(10)
  const catalog = exercises.value.map(ex => ({ id: ex.id, tags: ex.adminTags ?? [] }))
  categoryAcc.value = getCategoryAccuracy(catalog)
})

const masteryTotal = computed(() => mastery.value.reduce((a, b) => a + b, 0))
const masteredCount = computed(() => mastery.value[4] + mastery.value[5])
const boxLabels = ['New', 'Box 1', 'Box 2', 'Box 3', 'Box 4', 'Box 5']
const boxColors = ['bg-base-300', 'bg-error/60', 'bg-warning/60', 'bg-warning/40', 'bg-success/40', 'bg-success/60']

// XP progress to next level
const xpProgress = computed(() => {
  if (rank.value.level >= 10) return 100
  const prevXp = rank.value.level > 1 ? [0, 0, 20, 60, 150, 300, 500, 800, 1200, 1800][rank.value.level - 1] : 0
  const range = rank.value.nextLevelXp - prevXp
  return Math.min(Math.round(((rank.value.xp - prevXp) / range) * 100), 100)
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

function exerciseLabel(id: string): string {
  const ex = exercises.value.find(e => e.id === id)
  if (ex?.instruction) {
    const text = ex.instruction.replace(/[*_#\n]/g, ' ').trim()
    return text.length > 50 ? text.slice(0, 47) + '...' : text
  }
  return id
}

function trendArrow(trend: number): string {
  if (trend > 0.1) return '\u2191'
  if (trend < -0.1) return '\u2193'
  return '\u2192'
}

function trendClass(trend: number): string {
  if (trend > 0.1) return 'text-success'
  if (trend < -0.1) return 'text-error'
  return 'text-base-content/50'
}
</script>

<template>
  <div class="p-4 max-w-lg mx-auto flex flex-col gap-4">
    <!-- Tab bar -->
    <div class="flex gap-1 bg-base-200 rounded-lg p-1">
      <button
        v-for="tb in tabs"
        :key="tb.key"
        type="button"
        class="flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors"
        :class="tab === tb.key ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'"
        @click="tab = tb.key"
      >
        {{ $t(tb.label) }}
      </button>
    </div>

    <!-- ==================== SCORE CARD ==================== -->
    <template v-if="tab === 'scorecard'">
      <!-- Hero card (screenshot-worthy) -->
      <div class="rounded-2xl bg-gradient-to-br from-primary/20 via-base-200 to-success/20 border border-primary/30 p-6 flex flex-col items-center gap-4">
        <!-- Rank title -->
        <div class="text-center">
          <p class="text-xs text-base-content/50 uppercase tracking-widest">{{ $t('rankLabel') }}</p>
          <p class="text-3xl font-black text-primary mt-1">{{ rank.title }}</p>
          <p class="text-sm text-base-content/60 mt-1">{{ $t('level') }} {{ rank.level }}</p>
        </div>

        <!-- XP bar -->
        <div class="w-full max-w-xs">
          <div class="flex justify-between text-xs text-base-content/50 mb-1">
            <span>{{ rank.xp }} XP</span>
            <span v-if="rank.level < 10">{{ rank.nextLevelXp }} XP</span>
          </div>
          <div class="w-full bg-base-300 rounded-full h-2.5 overflow-hidden">
            <div class="h-full rounded-full bg-primary transition-all" :style="{ width: xpProgress + '%' }" />
          </div>
        </div>

        <!-- Big accuracy -->
        <div class="text-center">
          <p class="text-6xl font-black" :class="stats.totalAccuracy >= 70 ? 'text-success' : stats.totalAccuracy >= 40 ? 'text-warning' : 'text-error'">
            {{ stats.totalAccuracy }}%
          </p>
          <p class="text-sm text-base-content/60">{{ $t('statsOverallAccuracy') }}</p>
        </div>

        <!-- Key stats row -->
        <div class="flex gap-6 text-center">
          <div>
            <p class="text-2xl font-bold text-primary">{{ current }}</p>
            <p class="text-xs text-base-content/50">{{ $t('currentStreak') }}</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-success">{{ longest }}</p>
            <p class="text-xs text-base-content/50">{{ $t('longestStreak') }}</p>
          </div>
          <div>
            <p class="text-2xl font-bold">{{ stats.totalQuestions }}</p>
            <p class="text-xs text-base-content/50">{{ $t('statsTotalAnswered') }}</p>
          </div>
        </div>

        <!-- Mastery mini bar -->
        <div v-if="masteryTotal > 0" class="w-full max-w-xs">
          <p class="text-xs text-base-content/50 mb-1 text-center">
            {{ masteredCount }}/{{ masteryTotal }} {{ $t('statsMastered') }}
          </p>
          <div class="flex gap-0.5 h-3 rounded overflow-hidden">
            <div
              v-for="(count, box) in mastery"
              :key="box"
              v-show="count > 0"
              class="h-full"
              :class="boxColors[box]"
              :style="{ width: (count / masteryTotal * 100) + '%', minWidth: count > 0 ? '4px' : '0' }"
            />
          </div>
        </div>

        <!-- Practice time -->
        <p class="text-xs text-base-content/40">
          {{ formatDuration(stats.totalDurationMs) }} {{ $t('statsTotalTime').toLowerCase() }} · {{ stats.uniqueDays }} {{ $t('statsDaysPracticed').toLowerCase() }}
        </p>
      </div>

      <!-- Quick stats grid -->
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">{{ stats.totalCorrect }}</p>
          <p class="text-xs text-base-content/60">{{ $t('statsTotalCorrect') }}</p>
        </div>
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">{{ stats.totalQuestions - stats.totalCorrect }}</p>
          <p class="text-xs text-base-content/60">{{ $t('statsTotalWrong') }}</p>
        </div>
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">{{ stats.totalSessions }}</p>
          <p class="text-xs text-base-content/60">{{ $t('statsTotalSessions') }}</p>
        </div>
        <div class="rounded-lg bg-base-200 p-3">
          <p class="text-xl font-bold">{{ stats.averageStreak }}</p>
          <p class="text-xs text-base-content/60">{{ $t('statsAvgStreak') }}</p>
        </div>
      </div>
    </template>

    <!-- ==================== WEAK SPOTS ==================== -->
    <template v-if="tab === 'weakspots'">
      <!-- Category Accuracy -->
      <div v-if="categoryAcc.length > 0" class="flex flex-col gap-3">
        <h2 class="text-lg font-medium">{{ $t('statsByCategory') }}</h2>
        <div
          v-for="cat in categoryAcc"
          :key="cat.tag"
          class="flex items-center gap-3"
        >
          <span class="text-sm flex-1 truncate">{{ cat.tag }}</span>
          <div class="w-28 bg-base-300 rounded-full h-2.5 overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="cat.accuracy >= 70 ? 'bg-success' : cat.accuracy >= 40 ? 'bg-warning' : 'bg-error'"
              :style="{ width: cat.accuracy + '%' }"
            />
          </div>
          <span class="text-xs font-mono w-10 text-right">{{ cat.accuracy }}%</span>
        </div>
      </div>

      <!-- Weakest Exercises -->
      <div class="flex flex-col gap-3">
        <h2 class="text-lg font-medium">{{ $t('statsWeakest') }}</h2>
        <p v-if="weakest.length === 0" class="text-sm text-base-content/40">
          {{ $t('statsNoWeakSpots') }}
        </p>
        <div
          v-for="w in weakest"
          :key="w.id"
          class="rounded-lg border border-base-300 bg-base-200/50 px-3 py-2 flex items-center gap-3"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm truncate">{{ exerciseLabel(w.id) }}</p>
            <p class="text-xs text-base-content/50">
              {{ Math.round(w.accuracy * 100) }}% · {{ w.total }} {{ $t('statsAnswers') }} · {{ (w.avgTimeMs / 1000).toFixed(1) }}s
            </p>
          </div>
          <span class="text-lg font-bold" :class="trendClass(w.recentTrend)">
            {{ trendArrow(w.recentTrend) }}
          </span>
          <span class="text-xs font-mono bg-base-300 rounded px-1.5 py-0.5">
            {{ boxLabels[w.box] }}
          </span>
        </div>
      </div>
    </template>

    <!-- ==================== MASTERY MAP ==================== -->
    <template v-if="tab === 'mastery'">
      <!-- Mastery Distribution -->
      <div class="flex flex-col gap-3">
        <h2 class="text-lg font-medium">{{ $t('statsMastery') }}</h2>
        <p v-if="masteryTotal === 0" class="text-sm text-base-content/40">
          {{ $t('statsNoMastery') }}
        </p>
        <template v-else>
          <!-- Bar chart -->
          <div class="flex gap-2 items-end h-32">
            <div
              v-for="(count, box) in mastery"
              :key="box"
              class="flex-1 flex flex-col items-center gap-1"
            >
              <span class="text-xs font-bold">{{ count }}</span>
              <div
                class="w-full rounded-t transition-all"
                :class="boxColors[box]"
                :style="{ height: masteryTotal > 0 ? Math.max(count / masteryTotal * 100, count > 0 ? 4 : 0) + '%' : '0' }"
              />
              <span class="text-xs text-base-content/50">{{ boxLabels[box] }}</span>
            </div>
          </div>

          <!-- Summary -->
          <div class="grid grid-cols-3 gap-3 mt-2">
            <div class="rounded-lg bg-error/10 border border-error/30 p-3 text-center">
              <p class="text-xl font-bold text-error">{{ mastery[0] + mastery[1] }}</p>
              <p class="text-xs text-base-content/60">{{ $t('statsLearning') }}</p>
            </div>
            <div class="rounded-lg bg-warning/10 border border-warning/30 p-3 text-center">
              <p class="text-xl font-bold text-warning">{{ mastery[2] + mastery[3] }}</p>
              <p class="text-xs text-base-content/60">{{ $t('statsReviewing') }}</p>
            </div>
            <div class="rounded-lg bg-success/10 border border-success/30 p-3 text-center">
              <p class="text-xl font-bold text-success">{{ masteredCount }}</p>
              <p class="text-xs text-base-content/60">{{ $t('statsMasteredLabel') }}</p>
            </div>
          </div>
        </template>
      </div>

      <!-- Streaks detail -->
      <div class="flex flex-col gap-2">
        <h2 class="text-lg font-medium">{{ $t('statsStreaks') }}</h2>
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-lg bg-base-200 p-3">
            <p class="text-xl font-bold">{{ stats.totalStreaks }}</p>
            <p class="text-xs text-base-content/60">{{ $t('statsTotalStreaks') }}</p>
          </div>
          <div class="rounded-lg bg-base-200 p-3">
            <p class="text-xl font-bold">{{ stats.averageStreak }}</p>
            <p class="text-xs text-base-content/60">{{ $t('statsAvgStreak') }}</p>
          </div>
          <div class="rounded-lg bg-base-200 p-3">
            <p class="text-xl font-bold">{{ stats.shortestStreak }}</p>
            <p class="text-xs text-base-content/60">{{ $t('statsShortestStreak') }}</p>
          </div>
          <div class="rounded-lg bg-base-200 p-3">
            <p class="text-xl font-bold">{{ stats.longestStreak }}</p>
            <p class="text-xs text-base-content/60">{{ $t('statsLongestStreak') }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
