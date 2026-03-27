<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
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

const input = ref<number | null>(null)
const inputEl = ref<HTMLInputElement>()
const isInteractive = computed(() => props.phase === 'answering')
const isSubmitted = computed(() => props.phase === 'submitted')

watch(() => props.exercise, () => { input.value = null })

// Auto-focus when entering answering phase
watch(isInteractive, async (interactive) => {
  if (interactive) {
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(resolve))
    inputEl.value?.focus()
    inputEl.value?.select()
  }
})

function submit() {
  if (input.value === null) return
  const isCorrect = input.value === (props.exercise.correct as number)
  emit('submitted', { isCorrect, submittedValue: String(input.value) })
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (isInteractive.value && input.value !== null) {
      submit()
    } else if (isSubmitted.value) {
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
        v-if="result.isCorrect"
        class="rounded p-3 bg-success/20 border border-success text-success font-medium"
      >
        {{ exercise.correct }}
      </div>
      <div
        v-else
        class="flex flex-col gap-1"
      >
        <s class="text-base-content/60">{{ result.submittedValue }}</s>
        <span class="text-success font-medium">{{ exercise.correct }}</span>
      </div>
    </template>
    <template v-else>
      <input
        ref="inputEl"
        v-model.number="input"
        type="number"
        class="input input-bordered w-full"
        :placeholder="t('yourAnswer')"
        :disabled="!isInteractive"
        :autofocus="isInteractive"
        inputmode="numeric"
        :aria-label="`Number input for answer`"
      >
      <button
        class="btn btn-primary self-end"
        :disabled="!isInteractive || input === null"
        aria-label="Submit answer (or press Enter)"
        @click="submit"
      >
        {{ t('submit') }}
      </button>
    </template>
  </div>
</template>
