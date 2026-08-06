<script setup lang="ts">
defineProps<{ flipped: boolean }>()
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto">
    <slot
      v-if="!flipped"
      name="front"
    />
    <slot
      v-else
      name="back"
    />
  </div>
</template>
