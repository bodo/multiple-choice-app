<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettings } from '../entities/settings/useSettings'
import TopNav from './TopNav.vue'

const { locale } = useI18n({ useScope: 'global' })
const { language } = useSettings()

watch(language, (val) => { locale.value = val }, { immediate: true })
</script>

<template>
  <div class="flex flex-col h-dvh">
    <TopNav />
    <main class="flex-1 min-h-0 overflow-hidden max-w-5xl w-full mx-auto">
      <RouterView />
    </main>
  </div>
</template>
