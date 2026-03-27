<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useExercises } from '../../entities/exercise/useExercises'
import { useExerciseFlow } from './useExerciseFlow'
import QuestionSection from './QuestionSection.vue'
import AnswerSection from './AnswerSection.vue'

const { t } = useI18n()
const { exercises, isLoading } = useExercises()
const { phase, currentExercise, currentIndex, totalExercises, lastResult, submitAnswer, advance } = useExerciseFlow(exercises)
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
    class="flex flex-col landscape:flex-row h-full overflow-hidden"
  >
    <!-- Progress bar (above both columns in portrait, above left column in landscape) -->
    <div class="w-full landscape:w-1/2 px-4 pt-4 pb-2 flex-shrink-0">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-base-content/70">{{ t('question') }} {{ currentIndex.value + 1 }} {{ t('of') }} {{ totalExercises.value }}</span>
        <span class="text-xs text-base-content/50">{{ Math.round((currentIndex.value + 1) / totalExercises.value * 100) }}%</span>
      </div>
      <progress class="progress progress-primary w-full" :value="currentIndex.value + 1" :max="totalExercises.value" />
    </div>

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
</template>
