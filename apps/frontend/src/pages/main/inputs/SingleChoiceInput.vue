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

const selected = ref<number | null>(null)
const isInteractive = computed(() => props.phase === 'answering')
const showSubmit = computed(() => props.exercise.submitButton !== false)
const optionCount = computed(() => props.exercise.answerOptions?.length ?? 0)
const correctIndex = computed(() => (props.exercise.correct as number[])[0])

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

function formatShortcut(value: number): string {
  return `[${value}]`
}

// Shuffled display order: order[displayIdx] = originalIdx
const order = ref<number[]>(shuffledIndices(optionCount.value))
watch(() => props.exercise, () => {
  selected.value = null
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

function optionClass(originalIdx: number): string {
  if (isInteractive.value) {
    return selected.value === originalIdx
      ? 'border-primary bg-primary/10 text-primary shadow-sm'
      : 'border-base-300 bg-base-100 text-base-content shadow-sm hover:border-base-content/30 hover:bg-base-200'
  }
  const isCorrect = originalIdx === correctIndex.value
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
  const isCorrect = originalIdx === correctIndex.value
  const isSelected = selected.value === originalIdx
  if (isCorrect && isSelected) return '\u2713'   // ✓ user got it right
  if (isCorrect && !isSelected) return '\u2717'  // ✗ user missed the correct answer
  if (!isCorrect && isSelected) return '\u2717'  // ✗ user selected wrong
  return ''
}

function select(originalIdx: number) {
  if (!isInteractive.value || isOptionsCovered.value) return
  if (firstSelectedIdx.value === null) {
    firstSelectedIdx.value = originalIdx
  }
  optionChangeCount.value++
  if (selected.value === originalIdx) {
    selected.value = null
    return
  }
  selected.value = originalIdx
  if (!showSubmit.value && !hideOptionsInitially.value) submit()
}

function submit(confidence?: ConfidenceLevel) {
  if (confidence !== 'none' && selected.value === null) return
  const isCorrect = selected.value !== null && selected.value === correctIndex.value
  const scorePermille = isCorrect ? 1000 : 0
  const now = Date.now()
  const timeToRevealMs = hideOptionsInitially.value && revealedAt !== null
    ? Math.max(0, revealedAt - shownAt)
    : 0
  const timeToSubmitMs = Math.max(0, revealedAt !== null ? now - revealedAt : now - shownAt)

  emit('submitted', {
    isCorrect,
    scorePermille,
    outcome: outcomeForScore(scorePermille),
    selectedIndices: selected.value !== null ? [selected.value] : [],
    confidence: hideOptionsInitially.value ? (confidence ?? 'high') : confidence,
    timeToRevealMs,
    timeToSubmitMs,
    optionChangeCount: optionChangeCount.value,
    optionsCoveredMode: hideOptionsInitially.value,
    firstSelectedIdx: firstSelectedIdx.value,
    finalSelectedIdx: selected.value,
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
  // Number 1-4: select/undo by display position (only during answering)
  if (isInteractive.value && num >= 1 && num <= optionCount.value) {
    e.preventDefault()
    select(order.value[num - 1])
    return
  }

  // Enter or Space: submit (while answering) or advance (after submitted)
  if (e.key === 'Enter' || e.key === ' ') {
    if (isInteractive.value && (showSubmit.value || hideOptionsInitially.value)) {
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
        {{ t('singleCorrectOptionHint') }}
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
      <button
        v-for="(originalIdx, displayIdx) in order"
        :key="originalIdx"
        type="button"
        class="w-full rounded-lg border-2 px-4 py-3 flex items-start gap-3 text-left transition-colors duration-150 break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        :class="optionClass(originalIdx)"
        :disabled="!isInteractive"
        :aria-pressed="selected === originalIdx"
        :aria-label="`Option ${displayIdx + 1} of ${optionCount}`"
        @click="select(originalIdx)"
      >
        <span class="flex-1 min-w-0 break-words">
          <span
            class="mr-2 font-semibold text-primary"
            aria-label="keyboard shortcut"
          >{{ formatShortcut(displayIdx + 1) }}</span>
          <MarkdownRenderer
            inline
            :content="exercise.answerOptions?.[originalIdx] ?? ''"
          />
        </span>
        <span
          v-if="optionIcon(originalIdx)"
          class="shrink-0 text-lg font-bold"
          :class="optionIcon(originalIdx) === '\u2713' ? 'text-success' : 'text-error'"
        >{{ optionIcon(originalIdx) }}</span>
      </button>

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
          :disabled="selected === null"
          aria-label="bin unsicher"
          @click="submit('medium')"
        >
          {{ t('confidenceMedium') }}
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm sm:btn-md"
          :disabled="selected === null"
          aria-label="bin sicher"
          @click="submit('high')"
        >
          {{ t('confidenceHigh') }}
        </button>
      </div>

      <button
        v-else-if="showSubmit && isInteractive"
        type="button"
        class="btn btn-primary mt-2"
        :disabled="selected === null"
        aria-label="Submit answer (press Enter)"
        @click="submit()"
      >
        {{ t('submit') }}
      </button>
    </template>
  </div>
</template>
