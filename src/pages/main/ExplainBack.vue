<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Exercise, AnswerResult } from '../../entities/exercise/exercise'
import MarkdownRenderer from '../../dumb/MarkdownRenderer.vue'

const props = defineProps<{
  exercise: Exercise
  result: AnswerResult
}>()

const { t } = useI18n()

const isChoiceMode = computed(() =>
  props.exercise.inputMode === 'SINGLE_CHOICE' || props.exercise.inputMode === 'MULTIPLE_CHOICE',
)

const correctSet = computed(() => {
  const c = props.exercise.correct
  if (Array.isArray(c)) return new Set(c)
  if (typeof c === 'number') return new Set([c])
  return new Set<number>()
})

const selectedSet = computed(() => new Set(props.result.selectedIndices ?? []))

function optionIcon(idx: number): string {
  const isCorrect = correctSet.value.has(idx)
  const isSelected = selectedSet.value.has(idx)
  if (isCorrect && isSelected) return '\u2713'
  if (isCorrect && !isSelected) return '\u2717'
  if (!isCorrect && isSelected) return '\u2717'
  return ''
}

function optionIconClass(idx: number): string {
  const icon = optionIcon(idx)
  if (icon === '\u2713') return 'text-success'
  if (icon === '\u2717') return 'text-error'
  return ''
}

function optionBgClass(idx: number): string {
  const isCorrect = correctSet.value.has(idx)
  const isSelected = selectedSet.value.has(idx)
  if (isCorrect && isSelected) return 'border-success bg-success/10'
  if (!isCorrect && isSelected) return 'border-error bg-error/10'
  if (isCorrect) return 'border-success bg-success/10'
  return 'border-base-300 bg-base-200/50 opacity-60'
}

const isPartlyIncorrect = computed(() => {
  if (props.result.isCorrect || props.exercise.inputMode !== 'MULTIPLE_CHOICE') return false
  const selected = selectedSet.value
  return [...selected].some(i => correctSet.value.has(i))
})

const resultLabel = computed(() => {
  if (props.result.isCorrect) return t('correct')
  if (isPartlyIncorrect.value) return t('partlyIncorrect')
  return t('incorrect')
})

const resultClass = computed(() => {
  if (props.result.isCorrect) return 'bg-success/20 text-success'
  if (isPartlyIncorrect.value) return 'bg-error/20 text-error'
  return 'bg-error/20 text-error'
})

const hasExplanation = computed(() =>
  !!props.exercise.explainInstruction || (props.exercise.explainAnswerOptions?.some(e => !!e) ?? false),
)
</script>

<template>
  <div class="flex flex-col gap-3 w-full p-4">
    <!-- Result banner -->
    <div
      class="rounded-lg px-4 py-3 font-bold text-center text-lg"
      :class="resultClass"
    >
      {{ resultLabel }}
    </div>

    <!-- Choice-based: options with icons + explanations -->
    <template v-if="isChoiceMode && exercise.answerOptions">
      <div
        v-for="(option, idx) in exercise.answerOptions"
        :key="idx"
        class="rounded-lg border px-3 py-2 flex flex-col gap-1"
        :class="optionBgClass(idx)"
      >
        <div class="flex items-start gap-2">
          <span v-if="optionIcon(idx)" class="shrink-0 font-bold" :class="optionIconClass(idx)">
            {{ optionIcon(idx) }}
          </span>
          <div class="flex-1 min-w-0 text-sm break-words">
            <MarkdownRenderer :content="option" />
          </div>
        </div>
        <div
          v-if="exercise.explainAnswerOptions?.[idx]"
          class="text-xs text-base-content/60 pl-6 border-t border-base-300/30 pt-1 mt-1"
        >
          <MarkdownRenderer :content="exercise.explainAnswerOptions[idx]" />
        </div>
      </div>
    </template>

    <!-- Text-based result -->
    <template v-else-if="exercise.inputMode === 'TEXT'">
      <div class="rounded-lg border px-3 py-2" :class="result.isCorrect ? 'border-success bg-success/10' : 'border-error bg-error/10'">
        <span v-if="!result.isCorrect" class="text-error line-through">{{ result.submittedValue }}</span>
        <span :class="result.isCorrect ? 'text-success font-medium' : 'text-success font-medium block mt-1'">{{ exercise.correct }}</span>
      </div>
    </template>

    <!-- Number result -->
    <template v-else-if="exercise.inputMode === 'NUMBER'">
      <div class="rounded-lg border px-3 py-2" :class="result.isCorrect ? 'border-success bg-success/10' : 'border-error bg-error/10'">
        <span v-if="!result.isCorrect" class="text-error line-through">{{ result.submittedValue }}</span>
        <span :class="result.isCorrect ? 'text-success font-medium' : 'text-success font-medium block mt-1'">{{ exercise.correct }}</span>
      </div>
    </template>

    <!-- General explanation -->
    <div
      v-if="exercise.explainInstruction"
      class="rounded-lg border border-base-300 bg-base-200/50 p-3"
    >
      <p class="text-xs font-semibold text-base-content/50 mb-1">{{ t('explanation') }}</p>
      <div class="text-sm">
        <MarkdownRenderer :content="exercise.explainInstruction" />
      </div>
    </div>

    <!-- Fallback: no explanation data -->
    <template v-if="!hasExplanation && !isChoiceMode">
      <p class="text-sm text-base-content/40 text-center">{{ result.isCorrect ? t('correct') : t('incorrect') }}</p>
    </template>
  </div>
</template>
