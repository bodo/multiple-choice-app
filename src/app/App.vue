<script setup lang="ts">
import { watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettings } from '../entities/settings/useSettings'
import TopNav from './TopNav.vue'

const { locale } = useI18n({ useScope: 'global' })
const { language, theme } = useSettings()

watch(language, (val) => { locale.value = val }, { immediate: true })

const resolvedTheme = computed(() => {
  if (theme.value === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'abschluss-dark'
      : 'abschluss-light'
  }
  return theme.value
})

watch(resolvedTheme, (val) => {
  document.documentElement.setAttribute('data-theme', val)
  localStorage.setItem('theme', val)
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col h-dvh">
    <TopNav />
    <main class="flex-1 min-h-0 overflow-y-auto">
      <div class="max-w-5xl w-full mx-auto h-full">
        <RouterView />
      </div>
    </main>
  </div>
</template>
