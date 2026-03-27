<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettings } from '../../entities/settings/useSettings'

const { t } = useI18n()
const { autoAdvance, language, mode, timeoutCorrect, timeoutIncorrect } = useSettings()

const languages = [
  { code: 'eng', label: 'English' },
  { code: 'deu', label: 'Deutsch' },
]

const modes = [
  { code: 'train', label: t('trainMode') },
  { code: 'exam', label: t('examMode') },
]

const autoAdvanceDisabled = computed(() => mode.value === 'exam')

function incrementTimeout(ref: any, max: number = 5000) {
  ref.value = Math.min(ref.value + 250, max)
}

function decrementTimeout(ref: any, min: number = 250) {
  ref.value = Math.max(ref.value - 250, min)
}
</script>

<template>
  <div class="p-6 max-w-md flex flex-col gap-6">
    <h1 class="text-xl font-semibold">
      {{ t('settingsTitle') }}
    </h1>

    <!-- Mode Selection -->
    <div class="flex flex-col gap-2">
      <p class="font-medium">
        {{ t('mode') }}
      </p>
      <div class="flex gap-2">
        <button
          v-for="m in modes"
          :key="m.code"
          type="button"
          class="px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors flex-1"
          :class="mode === m.code
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-base-300 hover:border-base-content/30'"
          @click="mode = m.code as any"
        >
          {{ m.label }}
        </button>
      </div>
      <p v-if="mode === 'exam'" class="text-sm text-accent font-medium">
        {{ t('examModeInfo') }}
      </p>
    </div>

    <!-- Auto Advance Toggle -->
    <label class="flex items-start gap-4 cursor-pointer" :class="{ 'opacity-50 cursor-not-allowed': autoAdvanceDisabled }">
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
        :disabled="autoAdvanceDisabled"
      >
    </label>

    <!-- Timeout Settings (only show if auto advance enabled) -->
    <template v-if="autoAdvance">
      <!-- Correct Answer Timeout -->
      <div class="flex flex-col gap-2">
        <p class="font-medium">
          {{ t('timeoutCorrect') }}
        </p>
        <p class="text-sm text-base-content/60">
          {{ (timeoutCorrect / 1000).toFixed(1) }}s
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn btn-sm btn-outline flex-1"
            @click="decrementTimeout(timeoutCorrect)"
          >
            −
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline flex-1"
            @click="incrementTimeout(timeoutCorrect)"
          >
            +
          </button>
        </div>
      </div>

      <!-- Incorrect Answer Timeout -->
      <div class="flex flex-col gap-2">
        <p class="font-medium">
          {{ t('timeoutIncorrect') }}
        </p>
        <p class="text-sm text-base-content/60">
          {{ (timeoutIncorrect / 1000).toFixed(1) }}s
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn btn-sm btn-outline flex-1"
            @click="decrementTimeout(timeoutIncorrect)"
          >
            −
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline flex-1"
            @click="incrementTimeout(timeoutIncorrect)"
          >
            +
          </button>
        </div>
      </div>
    </template>

    <!-- Language Selection -->
    <div class="flex flex-col gap-2">
      <p class="font-medium">
        {{ t('language') }}
      </p>
      <div class="flex gap-2">
        <button
          v-for="lang in languages"
          :key="lang.code"
          type="button"
          class="px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors flex-1"
          :class="language === lang.code
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-base-300 hover:border-base-content/30'"
          @click="language = lang.code"
        >
          {{ lang.label }}
        </button>
      </div>
    </div>
  </div>
</template>
