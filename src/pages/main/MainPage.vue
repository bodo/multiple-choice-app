<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useExercises } from '../../entities/exercise/useExercises'
import { useExerciseFlow } from './useExerciseFlow'
import QuestionSection from './QuestionSection.vue'
import AnswerSection from './AnswerSection.vue'

const { t } = useI18n()
const { exercises, isLoading } = useExercises()
const { phase, currentExercise, lastResult, submitAnswer } = useExerciseFlow(exercises)
</script>

<template>
  <div
    v-if="isLoading || !currentExercise"
    class="h-dvh overflow-hidden flex items-center justify-center"
  >
    <span class="loading loading-spinner loading-lg" />
    <span class="ml-3">{{ t('loading') }}</span>
  </div>

  <div
    v-else
    class="flex flex-col landscape:flex-row h-dvh overflow-hidden"
  >
    <div class="landscape:w-1/2 overflow-y-auto p-4">
      <QuestionSection :exercise="currentExercise" />
    </div>
    <div class="landscape:w-1/2 overflow-y-auto flex flex-col items-end p-4">
      <AnswerSection
        :exercise="currentExercise"
        :phase="phase"
        :result="lastResult"
        @submitted="submitAnswer"
      />
    </div>
  </div>
</template>
