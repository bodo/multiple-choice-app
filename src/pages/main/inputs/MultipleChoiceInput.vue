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

const selected = ref<Set<number>>(new Set())
const isInteractive = computed(() => props.phase === 'answering')
const correctSet = computed(() => new Set(props.exercise.correct as number[]))
const optionCount = computed(() => props.exercise.answerOptions?.length ?? 0)

// Shuffled display order: order[displayIdx] = originalIdx
const order = ref<number[]>(shuffledIndices(optionCount.value))

// Build reverse map: displayPosition[originalIdx] = displayIdx
const displayPosition = computed(() => {
  const map = new Map<number, number>()
  order.value.forEach((origIdx, dispIdx) => map.set(origIdx, dispIdx))
  return map
})

const selectedDisplay = computed(() => {
  if (selected.value.size === 0) return ''
  return Array.from(selected.value)
    .map(origIdx => (displayPosition.value.get(origIdx) ?? 0) + 1)
    .sort((a, b) => a - b)
    .join(', ')
})

watch(() => props.exercise, () => {
  selected.value = new Set()
  order.value = shuffledIndices(props.exercise.answerOptions?.length ?? 0)
})

function toggle(idx: number) {
  if (!isInteractive.value) return
  const s = new Set(selected.value)
  if (s.has(idx)) { s.delete(idx) } else { s.add(idx) }
  selected.value = s
}

function rowClass(idx: number): string {
  if (isInteractive.value) {
    return selected.value.has(idx)
      ? 'border-primary bg-primary/10 shadow-sm'
      : 'border-base-300 bg-base-100 shadow-sm hover:border-base-content/30 hover:bg-base-200'
  }
  const isCorrect = correctSet.value.has(idx)
  const isSelected = selected.value.has(idx)
  // Correct + selected: solid green
  if (isCorrect && isSelected) return 'border-success bg-success/10'
  // Wrong + selected: red, blink
  if (!isCorrect && isSelected) return 'border-error bg-error/10 blink-attention'
  // Correct + not selected: green, blink to show what was missed
  if (isCorrect) return 'border-success bg-success/10 blink-attention'
  // Everything else: muted
  return 'border-base-300 bg-base-200 opacity-60'
}

function rowIcon(idx: number): string {
  if (isInteractive.value) return ''
  const isCorrect = correctSet.value.has(idx)
  const isSelected = selected.value.has(idx)
  if (isCorrect && isSelected) return '\u2713'   // ✓ user got this right
  if (isCorrect && !isSelected) return '\u2717'  // ✗ user missed this correct answer
  if (!isCorrect && isSelected) return '\u2717'  // ✗ user selected a wrong answer
  return ''
}

function submit() {
  const sel = [...selected.value]
  const correct = props.exercise.correct as number[]
  const isCorrect =
    sel.length === correct.length && sel.every((i) => correctSet.value.has(i))
  emit('submitted', { isCorrect, selectedIndices: sel })
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isInteractive.value && props.phase !== 'submitted') return

  const num = parseInt(e.key)
  // Number 1-4: toggle option by display position (only during answering)
  if (isInteractive.value && num >= 1 && num <= optionCount.value) {
    e.preventDefault()
    toggle(order.value[num - 1])
    return
  }

  // Enter or Space: submit (while answering) or advance (after submitted)
  if (e.key === 'Enter' || e.key === ' ') {
    if (isInteractive.value && selected.value.size > 0) {
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
    <!-- Selected display -->
    <div v-if="selected.size > 0 && isInteractive" class="w-full text-sm font-medium text-primary">
      Selected: {{ selectedDisplay }}
    </div>

    <!-- Options -->
    <div
      v-for="(originalIdx, displayIdx) in order"
      :key="originalIdx"
      class="w-full rounded-lg border-2 px-4 py-3 flex flex-row items-start gap-3 transition-colors duration-150"
      :class="[rowClass(originalIdx), isInteractive ? 'cursor-pointer' : 'cursor-default']"
      :role="isInteractive ? 'checkbox' : undefined"
      :aria-checked="selected.has(originalIdx)"
      :aria-label="`Option ${displayIdx + 1} of ${optionCount}`"
      @click="toggle(originalIdx)"
    >
      <span class="font-semibold text-primary mt-0.5" aria-label="keyboard shortcut">[{{ displayIdx + 1 }}]</span>
      <div class="flex-1 min-w-0 break-words">
        <MarkdownRenderer :content="exercise.answerOptions?.[originalIdx] ?? ''" />
      </div>
      <input
        v-if="isInteractive"
        type="checkbox"
        class="mt-1 shrink-0 h-4 w-4 rounded border-base-300 accent-primary"
        :checked="selected.has(originalIdx)"
        tabindex="-1"
        @click.stop="toggle(originalIdx)"
      >
      <span v-else-if="rowIcon(originalIdx)" class="shrink-0 text-lg font-bold" :class="rowIcon(originalIdx) === '\u2713' ? 'text-success' : 'text-error'">{{ rowIcon(originalIdx) }}</span>
    </div>

    <!-- Submit button -->
    <button
      type="button"
      class="btn btn-primary mt-2"
      :disabled="!isInteractive || selected.size === 0"
      aria-label="Submit answer (press Enter)"
      @click="submit"
    >
      {{ t('submit') }}
    </button>
  </div>
</template>
