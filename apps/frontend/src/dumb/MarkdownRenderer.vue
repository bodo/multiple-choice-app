<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

marked.setOptions({ breaks: true })

const props = defineProps<{
  content: string
  large?: boolean
  inline?: boolean
}>()

const html = computed(() => props.inline
  ? marked.parseInline(props.content) as string
  : marked.parse(props.content) as string)
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <span
    v-if="inline"
    class="inline prose prose-sm max-w-none"
    v-html="html"
  />
  <div
    v-else
    :class="large ? 'prose prose-xl max-w-none' : 'prose prose-sm max-w-none'"
    v-html="html"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>
