<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Exercise, AnswerResult, ConfidenceLevel } from '../../../entities/exercise/exercise'
import { outcomeForScore } from '../../../entities/exercise/answerOutcome'
import type { FlowPhase } from '../useExerciseFlow'
import MarkdownRenderer from '../../../dumb/MarkdownRenderer.vue'
import { shuffledIndices } from '../../../utils/shuffle'
import { useSettings } from '../../../entities/settings/useSettings'

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
const { hideOptionsInitially } = useSettings()

const selected = ref<Set<number>>(new Set())
const isInteractive = computed(() => props.phase === 'answering')
const correctSet = computed(() => new Set(props.exercise.correct as number[]))
const correctCount = computed(() => (props.exercise.correct as number[])?.length ?? 0)
const optionCount = computed(() => props.exercise.answerOptions?.length ?? 0)

const isOptionsCovered = ref(hideOptionsInitially.value)
let shownAt = Date.now()
let revealedAt: number | null = null
const optionChangeCount = ref(0)
const firstSelectedIdx = ref<number | null>(null)

function revealOptions() {
  if (!isOptionsCovered.value) return
  isOptionsCovered.value = false
  revealedAt = Date.now()
}

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

function formatShortcut(value: number): string {
  return `[${value}]`
}

watch(() => props.exercise, () => {
  selected.value = new Set()
  isOptionsCovered.value = hideOptionsInitially.value
  shownAt = Date.now()
  revealedAt = null
  optionChangeCount.value = 0
  firstSelectedIdx.value = null
  order.value = shuffledIndices(props.exercise.answerOptions?.length ?? 0)
})

watch(() => props.phase, (newPhase) => {
  if (newPhase === 'submitted') {
    isOptionsCovered.value = false
  }
})

function toggle(idx: number) {
  if (!isInteractive.value || isOptionsCovered.value) return
  if (firstSelectedIdx.value === null) {
    firstSelectedIdx.value = idx
  }
  optionChangeCount.value++
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

function submit(confidence?: ConfidenceLevel) {
  if (confidence !== 'none' && selected.value.size === 0) return
  const sel = [...selected.value]
  const correct = props.exercise.correct as number[]
  const selectedCorrect = sel.filter(index => correctSet.value.has(index)).length
  const selectedWrong = sel.length - selectedCorrect
  const correctShare = selectedCorrect / correct.length
  const wrongOptionCount = Math.max(0, optionCount.value - correct.length)
  const wrongShare = wrongOptionCount === 0 ? 0 : selectedWrong / wrongOptionCount
  const scorePermille = Math.round(Math.max(0, correctShare - wrongShare) * 1000)
  const now = Date.now()
  const timeToRevealMs = hideOptionsInitially.value && revealedAt !== null
    ? Math.max(0, revealedAt - shownAt)
    : 0
  const timeToSubmitMs = Math.max(0, revealedAt !== null ? now - revealedAt : now - shownAt)

  const wrongSelectedIdx = sel.find(index => !correctSet.value.has(index))
  const selectedDistractorType = wrongSelectedIdx !== undefined && props.exercise.distractorTypes
    ? props.exercise.distractorTypes[wrongSelectedIdx]
    : undefined

  emit('submitted', {
    isCorrect: scorePermille === 1000,
    scorePermille,
    outcome: outcomeForScore(scorePermille),
    selectedIndices: sel,
    confidence: hideOptionsInitially.value ? (confidence ?? 'high') : confidence,
    timeToRevealMs,
    timeToSubmitMs,
    optionChangeCount: optionChangeCount.value,
    optionsCoveredMode: hideOptionsInitially.value,
    firstSelectedIdx: firstSelectedIdx.value,
    finalSelectedIdx: sel[0] ?? null,
    selectedDistractorType,
  })
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isInteractive.value && props.phase !== 'submitted') return

  if (isInteractive.value && isOptionsCovered.value) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      revealOptions()
    }
    return
  }

  const num = parseInt(e.key)
  // Number 1-4: toggle option by display position (only during answering)
  if (isInteractive.value && num >= 1 && num <= optionCount.value) {
    e.preventDefault()
    toggle(order.value[num - 1])
    return
  }

  // Enter or Space: submit (while answering) or advance (after submitted)
  if (e.key === 'Enter' || e.key === ' ') {
    if (isInteractive.value && (selected.value.size > 0 || hideOptionsInitially.value)) {
      e.preventDefault()
      submit('high')
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
    <div
      v-if="isInteractive && isOptionsCovered"
      class="w-full flex flex-col items-center justify-center p-6 bg-base-200/60 border border-base-300 rounded-xl gap-3 text-center transition-all"
    >
      <p class="text-sm font-medium text-base-content/70">
        {{ correctCount === 1 ? t('singleCorrectOptionHint') : t('multipleCorrectOptionsHint', { count: correctCount }) }}
      </p>
      <button
        type="button"
        class="btn btn-primary btn-sm sm:btn-md"
        @click="revealOptions"
      >
        {{ t('revealOptions') }}
      </button>
    </div>

    <template v-else>
      <!-- Selected display -->
      <div
        v-if="selected.size > 0 && isInteractive"
        class="w-full text-sm font-medium text-primary"
      >
        {{ t('selectedValues', { values: selectedDisplay }) }}
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
        <div class="flex-1 min-w-0 break-words">
          <span
            class="mr-2 font-semibold text-primary"
            aria-label="keyboard shortcut"
          >{{ formatShortcut(displayIdx + 1) }}</span>
          <MarkdownRenderer
            inline
            :content="exercise.answerOptions?.[originalIdx] ?? ''"
          />
        </div>
        <input
          v-if="isInteractive"
          type="checkbox"
          class="mt-1 shrink-0 h-4 w-4 rounded border-base-300 accent-primary"
          :checked="selected.has(originalIdx)"
          tabindex="-1"
          @click.stop="toggle(originalIdx)"
        >
        <span
          v-else-if="rowIcon(originalIdx)"
          class="shrink-0 text-lg font-bold"
          :class="rowIcon(originalIdx) === '\u2713' ? 'text-success' : 'text-error'"
        >{{ rowIcon(originalIdx) }}</span>
      </div>

      <!-- 3 Confidence buttons if hideOptionsInitially is true -->
      <div
        v-if="isInteractive && hideOptionsInitially"
        class="w-full flex flex-wrap sm:flex-nowrap gap-2 justify-end mt-2"
      >
        <button
          type="button"
          class="btn btn-ghost btn-sm sm:btn-md text-error/80 hover:bg-error/10 hover:text-error"
          aria-label="weiß gar nicht"
          @click="submit('none')"
        >
          {{ t('confidenceNone') }}
        </button>
        <button
          type="button"
          class="btn btn-outline btn-warning btn-sm sm:btn-md"
          :disabled="selected.size === 0"
          aria-label="bin unsicher"
          @click="submit('medium')"
        >
          {{ t('confidenceMedium') }}
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm sm:btn-md"
          :disabled="selected.size === 0"
          aria-label="bin sicher"
          @click="submit('high')"
        >
          {{ t('confidenceHigh') }}
        </button>
      </div>

      <!-- Submit button -->
      <button
        v-else
        type="button"
        class="btn btn-primary mt-2"
        :disabled="!isInteractive || selected.size === 0"
        aria-label="Submit answer (press Enter)"
        @click="submit()"
      >
        {{ t('submit') }}
      </button>
    </template>
  </div>
</template>
