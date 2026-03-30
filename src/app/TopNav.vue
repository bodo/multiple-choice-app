<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { BookOpen, BarChart3, Bookmark, Settings, Sun, Moon } from 'lucide-vue-next'
import { useSettings } from '../entities/settings/useSettings'

const { theme } = useSettings()

const isDark = computed(() => {
  if (theme.value === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return theme.value === 'abschluss-dark'
})

function toggleTheme() {
  theme.value = isDark.value ? 'abschluss-light' : 'abschluss-dark'
}
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
      to="/stats"
      class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
      :class="useRoute().path === '/stats' ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:text-base-content hover:bg-base-200'"
    >
      <BarChart3 :size="16" />
      {{ $t('statsTitle') }}
    </RouterLink>
    <RouterLink
      to="/bookmarks"
      class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
      :class="useRoute().path === '/bookmarks' ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:text-base-content hover:bg-base-200'"
    >
      <Bookmark :size="16" />
      {{ $t('bookmarksTitle') }}
    </RouterLink>
    <RouterLink
      to="/settings"
      class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
      :class="useRoute().path === '/settings' ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:text-base-content hover:bg-base-200'"
    >
      <Settings :size="16" />
      {{ $t('settingsTitle') }}
    </RouterLink>
    <div class="flex-1" />
    <button
      type="button"
      class="p-2 rounded-lg text-base-content/60 hover:text-base-content hover:bg-base-200 transition-colors"
      :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      @click="toggleTheme"
    >
      <Moon v-if="!isDark" :size="16" />
      <Sun v-else :size="16" />
    </button>
  </header>
</template>
