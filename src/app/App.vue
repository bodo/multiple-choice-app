<script setup lang="ts">
import TopNav from './TopNav.vue'
</script>

<template>
  <div class="flex flex-col h-dvh">
    <TopNav />
    <main class="flex-1 min-h-0 overflow-hidden">
      <RouterView />
    </main>
  </div>
</template>
