<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  AnswerResult,
  Exercise,
} from '../../../entities/exercise/exercise'
import MarkdownRenderer from '../../../dumb/MarkdownRenderer.vue'
import type { FlowPhase } from '../useExerciseFlow'

const props = defineProps<{
  exercise: Exercise
  phase: FlowPhase
  result: AnswerResult | null
}>()

const emit = defineEmits<{
  submitted: [result: AnswerResult]
}>()

const { t } = useI18n()
const selections = ref<number[]>([])
const isInteractive = computed(() => props.phase === 'answering')
const answerOptions = computed(() => props.exercise.answerOptions ?? [])
const matchOptions = computed(() => props.exercise.matchOptions ?? [])
const allMatched = computed(() =>
  selections.value.length === answerOptions.value.length
  && selections.value.every(matchIndex => matchIndex >= 0)
  && new Set(selections.value).size === selections.value.length
)

function resetSelections() {
  selections.value = answerOptions.value.map(() => -1)
}

watch(() => props.exercise, resetSelections, { immediate: true })

function submit() {
  if (!isInteractive.value || !allMatched.value) return

  const submittedMatches = [...selections.value]
  const correctMatches = props.exercise.correct as number[]
  const isCorrect = submittedMatches.every(
    (matchIndex, rowIndex) => matchIndex === correctMatches[rowIndex],
  )
  emit('submitted', { isCorrect, submittedMatches })
}
</script>

<template>
  <div class="flex w-full flex-col items-end gap-3">
    <div class="flex w-full flex-col gap-3">
      <p class="text-sm text-base-content/60">
        {{ t('matchEachOnce') }}
      </p>
      <div
        v-for="(answerOption, rowIndex) in answerOptions"
        :key="rowIndex"
        class="rounded-lg border border-base-300 bg-base-100 p-3 shadow-sm"
      >
        <label
          class="mb-2 block text-sm font-medium"
          :for="`match-${exercise.id}-${rowIndex}`"
        >
          <MarkdownRenderer :content="answerOption" />
        </label>
        <select
          :id="`match-${exercise.id}-${rowIndex}`"
          v-model.number="selections[rowIndex]"
          class="select select-bordered w-full"
          :disabled="!isInteractive"
        >
          <option
            :value="-1"
          >
            {{ t('selectMatch') }}
          </option>
          <option
            v-for="(matchOption, matchIndex) in matchOptions"
            :key="matchIndex"
            :value="matchIndex"
          >
            {{ matchOption }}
          </option>
        </select>
      </div>
    </div>

    <button
      type="button"
      class="btn btn-primary"
      :disabled="!isInteractive || !allMatched"
      @click="submit"
    >
      {{ t('submit') }}
    </button>
  </div>
</template>
