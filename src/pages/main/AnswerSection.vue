<script setup lang="ts">
import type { Component } from 'vue'
import type { Exercise, AnswerResult } from '../../entities/exercise/exercise'
import type { FlowPhase } from './useExerciseFlow'
import SingleChoiceInput from './inputs/SingleChoiceInput.vue'
import MultipleChoiceInput from './inputs/MultipleChoiceInput.vue'
import TextInput from './inputs/TextInput.vue'
import NumberInput from './inputs/NumberInput.vue'

const props = defineProps<{
  exercise: Exercise
  phase: FlowPhase
  result: AnswerResult | null
}>()

const emit = defineEmits<{
  submitted: [result: AnswerResult]
  advance: []
}>()

const inputComponents: Record<string, Component> = {
  SINGLE_CHOICE: SingleChoiceInput,
  MULTIPLE_CHOICE: MultipleChoiceInput,
  TEXT: TextInput,
  NUMBER: NumberInput,
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
