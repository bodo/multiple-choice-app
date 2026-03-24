<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useExercises } from '../../entities/exercise/useExercises'
import { useExerciseFlow } from './useExerciseFlow'
import { useSettings } from '../../entities/settings/useSettings'
import QuestionSection from './QuestionSection.vue'
import AnswerSection from './AnswerSection.vue'

const { t } = useI18n()
const { exercises, isLoading } = useExercises()
const { phase, currentExercise, lastResult, submitAnswer, advance } = useExerciseFlow(exercises)
const { autoAdvance } = useSettings()
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
    <div class="landscape:w-1/2 overflow-y-auto p-4">
      <QuestionSection :exercise="currentExercise" />
    </div>
    <div class="landscape:w-1/2 overflow-y-auto flex flex-col items-end p-4 gap-3">
      <AnswerSection
        :exercise="currentExercise"
        :phase="phase"
        :result="lastResult"
        @submitted="submitAnswer"
      />
      <button
        v-if="phase === 'submitted' && !autoAdvance"
        type="button"
        class="rounded-lg border-2 border-blue-600 bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 hover:border-blue-700"
        @click="advance"
      >
        {{ t('next') }}
      </button>
    </div>
  </div>
</template>
