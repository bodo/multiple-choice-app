<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Exercise, AnswerResult } from '../../../entities/exercise/exercise'
import type { FlowPhase } from '../useExerciseFlow'

const props = defineProps<{
  exercise: Exercise
  phase: FlowPhase
  result: AnswerResult | null
}>()

const emit = defineEmits<{ submitted: [result: AnswerResult] }>()
const { t } = useI18n()

const input = ref<number | null>(null)
const isInteractive = computed(() => props.phase === 'answering')

watch(() => props.exercise, () => { input.value = null })

function submit() {
  if (input.value === null) return
  const isCorrect = input.value === (props.exercise.correct as number)
  emit('submitted', { isCorrect, submittedValue: String(input.value) })
}
</script>

<template>
  <div class="flex flex-col gap-3 w-full">
    <template v-if="result">
      <div
        v-if="result.isCorrect"
        class="rounded p-3 bg-success/20 border border-success text-success font-medium"
      >
        {{ exercise.correct }}
      </div>
      <div
        v-else
        class="flex flex-col gap-1"
      >
        <s class="text-base-content/60">{{ result.submittedValue }}</s>
        <span class="text-success font-medium">{{ exercise.correct }}</span>
      </div>
    </template>
    <template v-else>
      <input
        v-model="input"
        type="number"
        class="input input-bordered w-full"
        :placeholder="t('yourAnswer')"
        :disabled="!isInteractive"
        @keyup.enter="submit"
      >
      <button
        class="btn btn-primary self-end"
        :disabled="!isInteractive || input === null"
        @click="submit"
      >
        {{ t('submit') }}
      </button>
    </template>
  </div>
</template>
