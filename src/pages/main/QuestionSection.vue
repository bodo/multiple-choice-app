<script setup lang="ts">
import type { Exercise } from '../../entities/exercise/exercise'
import MarkdownRenderer from '../../dumb/MarkdownRenderer.vue'
import ImageViewer from './ImageViewer.vue'

defineProps<{ exercise: Exercise }>()
</script>

<template>
  <div class="flex flex-col gap-4">
    <MarkdownRenderer
      v-if="exercise.instruction"
      :content="exercise.instruction"
    />
    <ImageViewer
      v-for="img in exercise.images"
      :key="img"
      :src="`/data/img/${img}`"
    />
  </div>
</template>
