<script setup lang="ts">
import { computed } from 'vue'
import type { Exercise } from '../../entities/exercise/exercise'
import MarkdownRenderer from '../../dumb/MarkdownRenderer.vue'
import ImageViewer from './ImageViewer.vue'

const props = defineProps<{ exercise: Exercise }>()

const largeInstruction = computed(
  () => !props.exercise.images?.length && (props.exercise.instruction?.length ?? 0) < 150,
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <MarkdownRenderer
      v-if="exercise.instruction"
      :content="exercise.instruction"
      :large="largeInstruction"
    />
    <ImageViewer
      v-for="img in exercise.images"
      :key="img"
      :src="`/data/img/${img}`"
    />
  </div>
</template>
