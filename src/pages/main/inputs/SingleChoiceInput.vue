<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Exercise, AnswerResult } from '../../../entities/exercise/exercise'
import type { FlowPhase } from '../useExerciseFlow'
import MarkdownRenderer from '../../../dumb/MarkdownRenderer.vue'

const props = defineProps<{
  exercise: Exercise
  phase: FlowPhase
  result: AnswerResult | null
}>()

const emit = defineEmits<{ submitted: [result: AnswerResult] }>()
const { t } = useI18n()

const selected = ref<number | null>(null)
const isInteractive = computed(() => props.phase === 'answering')
const showSubmit = computed(() => props.exercise.submitButton !== false)

watch(() => props.exercise, () => { selected.value = null })

function optionClass(idx: number): string {
  if (isInteractive.value) {
    return selected.value === idx
      ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-sm'
      : 'border-gray-300 bg-white text-gray-800 shadow-sm hover:border-gray-400 hover:bg-gray-50'
  }
  const correctIdx = props.exercise.correct as number
  if (idx === correctIdx && selected.value === idx) return 'border-green-600 bg-green-100 text-green-900'
  if (idx !== correctIdx && selected.value === idx) return 'border-red-500 bg-red-100 text-red-900'
  if (idx === correctIdx) return 'border-amber-400 bg-amber-50 text-amber-800'
  return 'border-gray-200 bg-gray-50 text-gray-400'
}

function select(idx: number) {
  if (!isInteractive.value) return
  selected.value = idx
  if (!showSubmit.value) submit()
}

function submit() {
  if (selected.value === null) return
  const isCorrect = selected.value === (props.exercise.correct as number)
  emit('submitted', { isCorrect, selectedIndices: [selected.value] })
}
</script>

<template>
  <div class="flex flex-col gap-2 items-end w-full">
    <button
      v-for="(option, idx) in exercise.answerOptions"
      :key="idx"
      type="button"
      class="w-full rounded-lg border-2 px-4 py-3 text-left transition-colors duration-150 break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
      :class="optionClass(idx)"
      :disabled="!isInteractive"
      :aria-pressed="selected === idx"
      @click="select(idx)"
    >
      <MarkdownRenderer :content="option" />
    </button>
    <button
      v-if="showSubmit && isInteractive"
      type="button"
      class="mt-2 rounded-lg border-2 border-blue-600 bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 hover:border-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      :disabled="selected === null"
      @click="submit"
    >
      {{ t('submit') }}
    </button>
  </div>
</template>
