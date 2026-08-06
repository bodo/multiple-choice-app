<script setup lang="ts">
import { computed } from 'vue'
import type { Exercise } from '../../entities/exercise/exercise'
import MarkdownRenderer from '../../dumb/MarkdownRenderer.vue'
import ImageViewer from '../../dumb/ImageViewer.vue'

const props = withDefaults(
  defineProps<{
    exercise: Exercise
    showCategories?: boolean
  }>(),
  {
    showCategories: true,
  },
)

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
    <div
      v-if="showCategories && exercise.categories?.length"
      class="flex flex-wrap gap-1.5 mt-1"
    >
      <span
        v-for="cat in exercise.categories"
        :key="cat"
        class="badge badge-ghost badge-sm text-base-content/60"
      >
        {{ cat }}
      </span>
    </div>
  </div>
</template>
