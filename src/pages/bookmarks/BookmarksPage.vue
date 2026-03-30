<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bookmark, Trash2 } from 'lucide-vue-next'
import { useExercises } from '../../entities/exercise/useExercises'
import { useBookmarks } from '../../entities/exercise/useBookmarks'
import MarkdownRenderer from '../../dumb/MarkdownRenderer.vue'

const { t } = useI18n()
const { exercises } = useExercises()
const { bookmarks, toggleBookmark } = useBookmarks()

const bookmarkedExercises = computed(() =>
  exercises.value.filter(ex => bookmarks.value.has(ex.id)),
)
</script>

<template>
  <div class="p-6 max-w-lg flex flex-col gap-6">
    <h1 class="text-xl font-semibold flex items-center gap-2">
      <Bookmark :size="20" />
      {{ t('bookmarksTitle') }}
    </h1>

    <p v-if="bookmarkedExercises.length === 0" class="text-base-content/50 text-sm">
      {{ t('noBookmarks') }}
    </p>

    <div
      v-for="ex in bookmarkedExercises"
      :key="ex.id"
      class="rounded-lg border border-base-300 bg-base-100 p-4 flex gap-3"
    >
      <div class="flex-1 min-w-0">
        <span class="text-xs text-base-content/40 font-mono">{{ ex.id }}</span>
        <div v-if="ex.instruction" class="mt-1 text-sm line-clamp-3">
          <MarkdownRenderer :content="ex.instruction" />
        </div>
        <span class="text-xs mt-1 inline-block rounded bg-base-200 px-1.5 py-0.5 text-base-content/50">{{ ex.inputMode }}</span>
      </div>
      <button
        type="button"
        class="shrink-0 p-2 rounded text-error/60 hover:text-error hover:bg-error/10 transition-colors self-start"
        :aria-label="t('removeBookmark')"
        @click="toggleBookmark(ex.id)"
      >
        <Trash2 :size="16" />
      </button>
    </div>
  </div>
</template>
