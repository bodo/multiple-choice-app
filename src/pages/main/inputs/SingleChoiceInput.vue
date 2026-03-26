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
      ? 'border-primary bg-primary/10 text-primary shadow-sm'
      : 'border-base-300 bg-base-100 text-base-content shadow-sm hover:border-base-content/30 hover:bg-base-200'
  }
  const correctIdx = props.exercise.correct as number
  if (idx === correctIdx && selected.value === idx) return 'border-success bg-success/10 text-success'
  if (idx !== correctIdx && selected.value === idx) return 'border-error bg-error/10 text-error'
  if (idx === correctIdx) return 'border-warning bg-warning/10 text-warning'
  return 'border-base-300 bg-base-200 text-base-content/40'
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
      class="w-full rounded-lg border-2 px-4 py-3 text-left transition-colors duration-150 break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
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
      class="btn btn-primary mt-2"
      :disabled="selected === null"
      @click="submit"
    >
      {{ t('submit') }}
    </button>
  </div>
</template>
