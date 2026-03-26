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

const selected = ref<Set<number>>(new Set())
const isInteractive = computed(() => props.phase === 'answering')
const correctSet = computed(() => new Set(props.exercise.correct as number[]))

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
</script>

<template>
  <div class="flex flex-col gap-2 items-end w-full">
    <div
      v-for="(option, idx) in exercise.answerOptions"
      :key="idx"
      class="w-full rounded-lg border-2 px-4 py-3 flex flex-row items-start gap-3 transition-colors duration-150"
      :class="[rowClass(idx), isInteractive ? 'cursor-pointer' : 'cursor-default']"
      :role="isInteractive ? 'checkbox' : undefined"
      :aria-checked="selected.has(idx)"
      @click="toggle(idx)"
    >
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
    <button
      type="button"
      class="btn btn-primary mt-2"
      :disabled="!isInteractive || selected.size === 0"
      @click="submit"
    >
      {{ t('submit') }}
    </button>
  </div>
</template>
