<script setup lang="ts">
import type { Component } from 'vue'
import type {
  AnswerResult,
  Exercise,
  InputMode,
} from '../../entities/exercise/exercise'
import type { FlowPhase } from './useExerciseFlow'
import SingleChoiceInput from './inputs/SingleChoiceInput.vue'
import MultipleChoiceInput from './inputs/MultipleChoiceInput.vue'
import TextInput from './inputs/TextInput.vue'
import NumberInput from './inputs/NumberInput.vue'
import MatchInput from './inputs/MatchInput.vue'

const props = defineProps<{
  exercise: Exercise
  phase: FlowPhase
  result: AnswerResult | null
}>()

const emit = defineEmits<{
  submitted: [result: AnswerResult]
  advance: []
}>()

const inputComponents: Record<InputMode, Component> = {
  SINGLE_CHOICE: SingleChoiceInput,
  MULTIPLE_CHOICE: MultipleChoiceInput,
  TEXT: TextInput,
  NUMBER: NumberInput,
  MATCH: MatchInput,
}
</script>

<template>
  <component
    :is="inputComponents[exercise.inputMode]"
    :exercise="props.exercise"
    :phase="props.phase"
    :result="props.result"
    @submitted="emit('submitted', $event)"
    @advance="emit('advance')"
  />
</template>
