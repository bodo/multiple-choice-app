<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Exercise, AnswerResult } from '../../../entities/exercise/exercise'
import {
  evaluateTextAnswer,
  isRegexTextAnswer,
} from '../../../entities/exercise/textAnswerMatching'
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
const acceptedAnswers = computed(() => props.exercise.correct as string[])
const displayedAnswers = computed(() => {
  const literalAnswers = acceptedAnswers.value.filter(
    answer => !isRegexTextAnswer(answer),
  )
  return literalAnswers.length > 0 ? literalAnswers : acceptedAnswers.value
})

watch(() => props.exercise, () => { input.value = '' })

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

function submit() {
  if (!input.value.trim()) return
  const evaluation = evaluateTextAnswer(input.value, acceptedAnswers.value, {
    caseSensitive: props.exercise.caseSensitive,
    maximumStringDistance: props.exercise.maximumStringDistance,
  })
  emit('submitted', { ...evaluation, submittedValue: input.value })
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
      <div
        class="rounded p-3 border font-medium"
        :class="result.isCorrect ? 'bg-success/20 border-success' : 'bg-error/20 border-error'"
      >
        {{ result.submittedValue }}
      </div>
      <div
        v-if="!result.isCorrect || result.isCloseMatch"
        class="rounded p-3 bg-warning/20 border border-warning text-warning font-medium"
      >
        <p v-if="result.isCloseMatch">
          {{ t('closeMatch') }}
        </p>
        <p>
          {{ t('exactAnswer') }}
        </p>
        <ul class="list-disc list-inside">
          <li
            v-for="answer in displayedAnswers"
            :key="answer"
          >
            {{ answer }}
          </li>
        </ul>
      </div>
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
