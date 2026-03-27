<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Exercise, AnswerResult } from '../../../entities/exercise/exercise'
import type { FlowPhase } from '../useExerciseFlow'
import MarkdownRenderer from '../../../dumb/MarkdownRenderer.vue'

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
const selectedDisplay = computed(() => {
  if (selected.value.size === 0) return ''
  return Array.from(selected.value)
    .sort((a, b) => a - b)
    .map(i => i + 1)
    .join(', ')
})

watch(() => props.exercise, () => { selected.value = new Set() })

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
  if (isCorrect && isSelected) return 'border-success bg-success/10'
  if (!isCorrect && isSelected) return 'border-error bg-error/10'
  if (isCorrect) return 'border-warning bg-warning/10'
  return 'border-base-300 bg-base-200 opacity-60'
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
  // Number 1-4: toggle option (only during answering)
  if (isInteractive.value && num >= 1 && num <= optionCount.value) {
    e.preventDefault()
    toggle(num - 1)
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
</script>

<template>
  <div class="flex flex-col gap-2 items-end w-full">
    <!-- Selected display -->
    <div v-if="selected.size > 0 && isInteractive" class="w-full text-sm font-medium text-primary">
      Selected: {{ selectedDisplay }}
    </div>

    <!-- Options -->
    <div
      v-for="(option, idx) in exercise.answerOptions"
      :key="idx"
      class="w-full rounded-lg border-2 px-4 py-3 flex flex-row items-start gap-3 transition-colors duration-150"
      :class="[rowClass(idx), isInteractive ? 'cursor-pointer' : 'cursor-default']"
      :role="isInteractive ? 'checkbox' : undefined"
      :aria-checked="selected.has(idx)"
      :aria-label="`Option ${idx + 1} of ${optionCount}`"
      @click="toggle(idx)"
    >
      <span class="font-semibold text-primary mt-0.5" aria-label="keyboard shortcut">[{{ idx + 1 }}]</span>
      <div class="flex-1 min-w-0 break-words">
        <MarkdownRenderer :content="option" />
      </div>
      <input
        type="checkbox"
        class="mt-1 shrink-0 h-4 w-4 rounded border-base-300 accent-primary"
        :checked="selected.has(idx)"
        :disabled="!isInteractive"
        tabindex="-1"
        @click.stop="toggle(idx)"
      >
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
