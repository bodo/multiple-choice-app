<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { distance } from 'fastest-levenshtein'
import type { Exercise, AnswerResult } from '../../../entities/exercise/exercise'
import type { FlowPhase } from '../useExerciseFlow'

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

const input = ref('')
const inputEl = ref<HTMLInputElement>()
const isInteractive = computed(() => props.phase === 'answering')
const isSubmitted = computed(() => props.phase === 'submitted')

watch(() => props.exercise, () => { input.value = ''; wordChecks.value = [] })

// Auto-focus when entering answering phase or when exercise changes
async function focusInput() {
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(resolve))
  inputEl.value?.focus()
  inputEl.value?.select()
}
watch(isInteractive, (interactive) => { if (interactive) focusInput() })
watch(() => props.exercise, () => { if (isInteractive.value) focusInput() })
onMounted(() => { if (isInteractive.value) focusInput() })

function normalize(s: string): string {
  return props.exercise.caseSensitive ? s : s.toLowerCase()
}

interface WordCheck {
  given: string
  correct: string
  ok: boolean
}

const wordChecks = ref<WordCheck[]>([])

function checkWords(given: string, correct: string): WordCheck[] {
  const givenWords = given.trim().split(/\s+/)
  const correctWords = correct.trim().split(/\s+/)
  const maxLen = Math.max(givenWords.length, correctWords.length)
  const results: WordCheck[] = []
  for (let i = 0; i < maxLen; i++) {
    const g = givenWords[i] ?? ''
    const c = correctWords[i] ?? ''
    const ok = g !== '' && c !== '' && distance(normalize(g), normalize(c)) <= 1
    results.push({ given: g, correct: c, ok })
  }
  return results
}

function submit() {
  if (!input.value.trim()) return
  const correct = props.exercise.correct as string
  const checks = checkWords(input.value, correct)
  wordChecks.value = checks
  const allCorrect = checks.every(w => w.ok)
  const isExact = normalize(input.value.trim()) === normalize(correct.trim())
  emit('submitted', { isCorrect: allCorrect, isCloseMatch: allCorrect && !isExact, submittedValue: input.value })
}

let submitTime = 0
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (e.repeat) return
    if (isInteractive.value && input.value.trim()) {
      submit()
      submitTime = Date.now()
    } else if (isSubmitted.value && Date.now() - submitTime > 500) {
      emit('advance')
    }
  } else if (e.key === 'Escape' && isSubmitted.value) {
    e.preventDefault()
    emit('advance')
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
  <div class="flex flex-col gap-3 w-full">
    <template v-if="result">
      <!-- User's answer with per-word feedback -->
      <div class="rounded p-3 border font-medium" :class="result.isCorrect ? 'bg-success/20 border-success' : 'bg-error/20 border-error'">
        <span
          v-for="(w, i) in wordChecks"
          :key="i"
        ><span :class="w.ok ? 'text-success' : 'text-error line-through'">{{ w.given }}</span><span v-if="!w.ok && w.correct" class="text-success ml-1">[{{ w.correct }}]</span>{{ ' ' }}</span>
      </div>
      <!-- Close match hint -->
      <div
        v-if="result.isCorrect && result.isCloseMatch"
        class="rounded p-3 bg-warning/20 border border-warning text-warning font-medium"
        v-html="t('closeMatch', { answer: exercise.correct })"
      />
    </template>
    <template v-else>
      <input
        ref="inputEl"
        v-model="input"
        type="text"
        class="input input-bordered w-full"
        :placeholder="t('yourAnswer')"
        :disabled="!isInteractive"
        :autofocus="isInteractive"
        :aria-label="`Text input for answer`"
      >
      <button
        class="btn btn-primary self-end"
        :disabled="!isInteractive || !input.trim()"
        aria-label="Submit answer (or press Enter)"
        @click="submit"
      >
        {{ t('submit') }}
      </button>
    </template>
  </div>
</template>
