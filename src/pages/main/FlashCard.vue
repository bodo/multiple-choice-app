<script setup lang="ts">
defineProps<{ flipped: boolean }>()
</script>

<template>
  <div>
    <slot v-if="!flipped" name="front" />
    <slot v-else name="back" />
  </div>
</template>
