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

watch(() => props.exercise, () => { selected.value = null })
const showSubmit = computed(() => props.exercise.submitButton !== false)

function optionClass(idx: number): string {
  if (isInteractive.value) {
    return selected.value === idx ? 'btn-primary' : ''
  }
  const correctIdx = props.exercise.correct as number
  if (idx === correctIdx && selected.value === idx) return 'btn-success'
  if (idx !== correctIdx && selected.value === idx) return 'btn-error'
  if (idx === correctIdx && selected.value !== idx) return 'btn-warning'
  return ''
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
      class="btn whitespace-normal h-auto text-left justify-start"
      :class="optionClass(idx)"
      :disabled="!isInteractive"
      @click="select(idx)"
    >
      <MarkdownRenderer :content="option" />
    </button>
    <button
      v-if="showSubmit && isInteractive"
      class="btn btn-primary self-end mt-2"
      :disabled="selected === null"
      @click="submit"
    >
      {{ t('submit') }}
    </button>
  </div>
</template>
