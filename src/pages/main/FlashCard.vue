<script setup lang="ts">
defineProps<{ flipped: boolean }>()
</script>

<template>
  <div class="flip-card h-full" :class="{ flipped }">
    <div class="flip-card-inner h-full">
      <div class="flip-card-front h-full overflow-y-auto">
        <slot name="front" />
      </div>
      <div class="flip-card-back h-full overflow-y-auto">
        <slot name="back" />
      </div>
    </div>
  </div>
</template>
