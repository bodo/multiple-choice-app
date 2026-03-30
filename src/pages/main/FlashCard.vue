<script setup lang="ts">
defineProps<{ flipped: boolean }>()
</script>

<template>
  <!-- Landscape/desktop: simple swap, no animation -->
  <div class="hidden landscape:contents">
    <slot v-if="!flipped" name="front" />
    <slot v-else name="back" />
  </div>

  <!-- Portrait/mobile: 3D flip -->
  <div class="landscape:hidden flip-card h-full" :class="{ flipped }">
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
