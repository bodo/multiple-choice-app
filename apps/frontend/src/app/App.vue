<script setup lang="ts">
import { watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettings } from '../entities/settings/useSettings'
import { initializeExerciseLoading } from '../entities/exercise/useExercises'
import { useNetworkStatus } from '../entities/network/useNetworkStatus'
import MobileDock from './MobileDock.vue'
import TopNav from './TopNav.vue'

const { locale } = useI18n({ useScope: 'global' })
const { language, theme, exerciseSource, specialization } = useSettings()
const { isOnline } = useNetworkStatus()

initializeExerciseLoading(exerciseSource, specialization, isOnline)

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
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col h-dvh">
    <TopNav />
    <main class="flex-1 min-h-0 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <div class="max-w-5xl w-full mx-auto h-full">
        <RouterView />
      </div>
    </main>
    <MobileDock />
  </div>
</template>
