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

watch(() => props.exercise, () => { selected.value = new Set() })
const correctSet = computed(() => new Set(props.exercise.correct as number[]))

function toggle(idx: number) {
  if (!isInteractive.value) return
  const s = new Set(selected.value)
  if (s.has(idx)) { s.delete(idx) } else { s.add(idx) }
  selected.value = s
}

function cardClass(idx: number): string {
  if (isInteractive.value) return 'bg-base-200'
  const isCorrect = correctSet.value.has(idx)
  const isSelected = selected.value.has(idx)
  if (isCorrect && isSelected) return 'bg-success/20 border-success'
  if (!isCorrect && isSelected) return 'bg-error/20 border-error'
  if (isCorrect && !isSelected) return 'bg-warning/20 border-warning'
  return 'bg-base-200'
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
      class="card border p-3 flex flex-row items-start gap-3 cursor-pointer w-full"
      :class="cardClass(idx)"
      @click="toggle(idx)"
    >
      <div class="flex-1 text-right">
        <MarkdownRenderer :content="option" />
      </div>
      <input
        type="checkbox"
        class="checkbox ml-auto mt-1"
        :checked="selected.has(idx)"
        :disabled="!isInteractive"
        @click.stop="toggle(idx)"
      >
    </div>
    <button
      class="btn btn-primary self-end mt-2"
      :disabled="!isInteractive || selected.size === 0"
      @click="submit"
    >
      {{ t('submit') }}
    </button>
  </div>
</template>
