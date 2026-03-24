<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps<{ content: string; large?: boolean }>()

const html = computed(() => marked.parse(props.content) as string)
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <div
    :class="large ? 'prose prose-xl max-w-none' : 'prose prose-sm max-w-none'"
    v-html="html"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>
