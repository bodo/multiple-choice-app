<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSettings } from '../../entities/settings/useSettings'

const { t } = useI18n()
const { autoAdvance } = useSettings()
</script>

<template>
  <div class="p-6 max-w-md">
    <h1 class="text-xl font-semibold mb-6">
      {{ t('settingsTitle') }}
    </h1>

    <label class="flex items-start gap-4 cursor-pointer">
      <div class="flex-1">
        <p class="font-medium text-base-content">
          {{ t('autoAdvance') }}
        </p>
        <p class="text-sm text-base-content/60 mt-0.5">
          {{ t('autoAdvanceHint') }}
        </p>
      </div>
      <input
        v-model="autoAdvance"
        type="checkbox"
        class="toggle toggle-primary mt-0.5"
      >
    </label>
  </div>
</template>
