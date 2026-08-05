<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bookmark, ShieldAlert, Trash2 } from 'lucide-vue-next'
import type { Exercise } from '../../entities/exercise/exercise'
import { useBookmarks } from '../../entities/exercise/useBookmarks'
import { useExerciseLibrary } from '../../entities/exercise/useExerciseLibrary'
import { useExercises } from '../../entities/exercise/useExercises'
import {
  isExerciseWeakspot,
  markExerciseAsWeakspot,
} from '../../entities/exercise/useExerciseHistory'
import MarkdownRenderer from '../../dumb/MarkdownRenderer.vue'
import ExercisePreviewDialog from '../../features/exercise-view/ExercisePreviewDialog.vue'

const { t } = useI18n()
const { bookmarkItems, removeBookmark } = useBookmarks()
const { getExercise } = useExerciseLibrary()
const { exercises } = useExercises()
const selectedExercise = ref<Exercise | null>(null)
const currentExerciseIds = computed(() => new Set(
  exercises.value.map(exercise => exercise.id),
))

const bookmarkedExercises = computed(() => bookmarkItems.value.map(bookmark => ({
  ...bookmark,
  exercise: getExercise(bookmark.exerciseId),
})))

async function markSelectedAsWeakspot() {
  if (!selectedExercise.value) return
  await markExerciseAsWeakspot(selectedExercise.value.id)
}
</script>

<template>
  <div class="p-4 max-w-lg mx-auto flex flex-col gap-4">
    <h1 class="text-xl font-semibold flex items-center gap-2">
      <Bookmark :size="20" />
      {{ t('bookmarksTitle') }}
    </h1>

    <p
      v-if="bookmarkedExercises.length === 0"
      class="text-base-content/50 text-sm"
    >
      {{ t('noBookmarks') }}
    </p>

    <div
      v-for="item in bookmarkedExercises"
      :key="item.exerciseId"
      class="rounded-lg border border-base-300 bg-base-100 flex gap-2"
    >
      <button
        type="button"
        class="flex-1 min-w-0 p-4 text-left disabled:cursor-default"
        :disabled="!item.exercise"
        @click="selectedExercise = item.exercise"
      >
        <span class="text-xs text-base-content/40 font-mono">{{ item.exerciseId }}</span>
        <div
          v-if="item.exercise?.instruction"
          class="mt-1 text-sm line-clamp-3"
        >
          <MarkdownRenderer :content="item.exercise.instruction" />
        </div>
        <span
          v-else
          class="block mt-1 text-sm text-warning"
        >{{ t('cardUnavailable') }}</span>
        <span
          v-if="item.exercise"
          class="badge badge-ghost badge-sm mt-2"
        >{{ item.exercise.inputMode }}</span>
        <span
          v-if="item.exercise && !currentExerciseIds.has(item.exerciseId)"
          class="badge badge-ghost badge-sm mt-2 ml-1"
        >{{ t('outsideCurrentExerciseSet') }}</span>
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square text-error self-start mt-2 mr-2"
        :aria-label="t('removeBookmark')"
        @click="removeBookmark(item.exerciseId)"
      >
        <Trash2 :size="16" />
      </button>
    </div>
  </div>

  <ExercisePreviewDialog
    :exercise="selectedExercise"
    @close="selectedExercise = null"
  >
    <template #actions>
      <button
        v-if="selectedExercise && !isExerciseWeakspot(selectedExercise.id)"
        type="button"
        class="btn btn-warning btn-sm"
        @click="markSelectedAsWeakspot"
      >
        <ShieldAlert :size="16" />
        {{ t('markWeakspot') }}
      </button>
      <button
        v-if="selectedExercise"
        type="button"
        class="btn btn-ghost btn-sm text-error"
        @click="removeBookmark(selectedExercise.id); selectedExercise = null"
      >
        <Trash2 :size="16" />
        {{ t('removeBookmark') }}
      </button>
    </template>
  </ExercisePreviewDialog>
</template>
