<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Exercise, AnswerResult } from '../../../entities/exercise/exercise'
import type { FlowPhase } from '../useExerciseFlow'
import MarkdownRenderer from '../../../dumb/MarkdownRenderer.vue'
import { shuffledIndices } from '../../../utils/shuffle'

const props = defineProps<{
  exercise: Exercise
  phase: FlowPhase
  result: AnswerResult | null
}>()

const emit = defineEmits<{
  submitted: [result: AnswerResult]
  advance: []
}>()
const { t } = useI18n()

const selected = ref<number | null>(null)
const isInteractive = computed(() => props.phase === 'answering')
const showSubmit = computed(() => props.exercise.submitButton !== false)
const optionCount = computed(() => props.exercise.answerOptions?.length ?? 0)

// Shuffled display order: order[displayIdx] = originalIdx
const order = ref<number[]>(shuffledIndices(optionCount.value))
watch(() => props.exercise, () => {
  selected.value = null
  order.value = shuffledIndices(props.exercise.answerOptions?.length ?? 0)
})

function optionClass(originalIdx: number): string {
  if (isInteractive.value) {
    return selected.value === originalIdx
      ? 'border-primary bg-primary/10 text-primary shadow-sm'
      : 'border-base-300 bg-base-100 text-base-content shadow-sm hover:border-base-content/30 hover:bg-base-200'
  }
  const correctIdx = props.exercise.correct as number
  const isCorrect = originalIdx === correctIdx
  const isSelected = selected.value === originalIdx
  // Correct + selected: solid green
  if (isCorrect && isSelected) return 'border-success bg-success/10 text-success'
  // Wrong + selected: red, blink to draw attention
  if (!isCorrect && isSelected) return 'border-error bg-error/10 text-error blink-attention'
  // Correct + not selected: green, blink to show what was missed
  if (isCorrect) return 'border-success bg-success/10 text-success blink-attention'
  // Everything else: muted
  return 'border-base-300 bg-base-200 text-base-content/40'
}

function optionIcon(originalIdx: number): string {
  if (isInteractive.value) return ''
  const correctIdx = props.exercise.correct as number
  const isCorrect = originalIdx === correctIdx
  const isSelected = selected.value === originalIdx
  if (isCorrect && isSelected) return '\u2713'   // ✓ user got it right
  if (isCorrect && !isSelected) return '\u2717'  // ✗ user missed the correct answer
  if (!isCorrect && isSelected) return '\u2717'  // ✗ user selected wrong
  return ''
}

function select(originalIdx: number) {
  if (!isInteractive.value) return
  if (selected.value === originalIdx) {
    selected.value = null
    return
  }
  selected.value = originalIdx
  if (!showSubmit.value) submit()
}

function submit() {
  if (selected.value === null) return
  const isCorrect = selected.value === (props.exercise.correct as number)
  emit('submitted', { isCorrect, selectedIndices: [selected.value] })
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isInteractive.value && props.phase !== 'submitted') return

  const num = parseInt(e.key)
  // Number 1-4: select/undo by display position (only during answering)
  if (isInteractive.value && num >= 1 && num <= optionCount.value) {
    e.preventDefault()
    select(order.value[num - 1])
    return
  }

  // Enter or Space: submit (while answering) or advance (after submitted)
  if (e.key === 'Enter' || e.key === ' ') {
    if (isInteractive.value && showSubmit.value) {
      e.preventDefault()
      submit()
      return
    }
    if (props.phase === 'submitted') {
      e.preventDefault()
      emit('advance')
      return
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="flex flex-col gap-2 items-end w-full">
    <button
      v-for="(originalIdx, displayIdx) in order"
      :key="originalIdx"
      type="button"
      class="w-full rounded-lg border-2 px-4 py-3 text-left transition-colors duration-150 break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
      :class="optionClass(originalIdx)"
      :disabled="!isInteractive"
      :aria-pressed="selected === originalIdx"
      :aria-label="`Option ${displayIdx + 1} of ${optionCount}`"
      @click="select(originalIdx)"
    >
      <span class="inline-block mr-2 font-semibold text-primary shrink-0" aria-label="keyboard shortcut">[{{ displayIdx + 1 }}]</span>
      <span class="flex-1 min-w-0 break-words"><MarkdownRenderer :content="exercise.answerOptions?.[originalIdx] ?? ''" /></span>
      <span v-if="optionIcon(originalIdx)" class="shrink-0 text-lg font-bold" :class="optionIcon(originalIdx) === '\u2713' ? 'text-success' : 'text-error'">{{ optionIcon(originalIdx) }}</span>
    </button>
    <button
      v-if="showSubmit && isInteractive"
      type="button"
      class="btn btn-primary mt-2"
      :disabled="selected === null"
      aria-label="Submit answer (press Enter)"
      @click="submit"
    >
      {{ t('submit') }}
    </button>
  </div>
</template>
