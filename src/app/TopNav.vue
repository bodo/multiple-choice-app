<script setup lang="ts">
import { useRoute } from 'vue-router'
import { BookOpen, Settings } from 'lucide-vue-next'
</script>

<template>
  <header class="flex gap-1 px-3 h-12 items-center border-b border-base-200 bg-base-100 shrink-0">
    <RouterLink
      to="/"
      class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
      :class="useRoute().path === '/' ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:text-base-content hover:bg-base-200'"
    >
      <BookOpen :size="16" />
      {{ $t('practice') }}
    </RouterLink>
    <RouterLink
      to="/settings"
      class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
      :class="useRoute().path === '/settings' ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:text-base-content hover:bg-base-200'"
    >
      <Settings :size="16" />
      {{ $t('settingsTitle') }}
    </RouterLink>
  </header>
</template>
