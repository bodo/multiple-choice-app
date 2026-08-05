<script setup lang="ts">
import { computed } from 'vue'
import { Bookmark, ShieldAlert } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import MarkdownRenderer from '../../dumb/MarkdownRenderer.vue'
import { useSettings } from '../../entities/settings/useSettings'
import germanHelp from './content/deu.md?raw'
import englishHelp from './content/eng.md?raw'

const HELP_HINTS_MARKER = '<!-- help-action-hints -->'

const { t } = useI18n()
const { language } = useSettings()
const content = computed(() => language.value === 'deu' ? germanHelp : englishHelp)
const contentParts = computed(() => {
  const [beforeHints, afterHints = ''] = content.value.split(HELP_HINTS_MARKER)
  return { beforeHints, afterHints }
})
</script>

<template>
  <div class="max-w-3xl p-6 mx-auto">
    <MarkdownRenderer :content="contentParts.beforeHints" />
    <div class="flex flex-col gap-3 my-6">
      <div class="alert">
        <Bookmark
          :size="20"
          class="text-warning"
        />
        <span>{{ t('helpBookmarkHint') }}</span>
      </div>
      <div class="alert">
        <ShieldAlert
          :size="20"
          class="text-warning"
        />
        <span>{{ t('helpWeakspotHint') }}</span>
      </div>
    </div>
    <MarkdownRenderer :content="contentParts.afterHints" />
  </div>
</template>
