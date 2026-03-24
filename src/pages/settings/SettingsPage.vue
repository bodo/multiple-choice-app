<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSettings } from '../../entities/settings/useSettings'

const { t } = useI18n()
const { autoAdvance, language } = useSettings()

const languages = [
  { code: 'eng', label: 'English' },
  { code: 'deu', label: 'Deutsch' },
]
</script>

<template>
  <div class="p-6 max-w-md flex flex-col gap-6">
    <h1 class="text-xl font-semibold">
      {{ t('settingsTitle') }}
    </h1>

    <label class="flex items-start gap-4 cursor-pointer">
      <div class="flex-1">
        <p class="font-medium">
          {{ t('autoAdvance') }}
        </p>
        <p class="text-sm text-base-content/60 mt-0.5">
          {{ t('autoAdvanceHint') }}
        </p>
      </div>
      <input
        v-model="autoAdvance"
        type="checkbox"
        class="toggle toggle-primary mt-0.5 shrink-0"
      >
    </label>

    <div class="flex flex-col gap-2">
      <p class="font-medium">
        {{ t('language') }}
      </p>
      <div class="flex gap-2">
        <button
          v-for="lang in languages"
          :key="lang.code"
          type="button"
          class="px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors"
          :class="language === lang.code
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-base-300 hover:border-base-400'"
          @click="language = lang.code"
        >
          {{ lang.label }}
        </button>
      </div>
    </div>
  </div>
</template>
