<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useExerciseCatalog } from '../../entities/exercise/useExerciseCatalog'
import { useSettings } from '../../entities/settings/useSettings'

defineProps<{ labeled?: boolean }>()

const { t } = useI18n()
const { mode } = useSettings()
const {
  allCategories,
  activeCategoryFilter,
  setCategoryFilter,
} = useExerciseCatalog()

const isExam = computed(() => mode.value === 'exam')

watch(isExam, (exam) => {
  if (exam) setCategoryFilter(null)
}, { immediate: true })

function onCategoryChange(event: Event) {
  const category = (event.target as HTMLSelectElement).value
  setCategoryFilter(category || null)
}
</script>

<template>
  <label
    v-if="allCategories.length > 0"
    class="flex flex-col gap-1"
    :class="{ 'w-full': labeled }"
  >
    <span
      v-if="labeled"
      class="text-xs font-medium text-base-content/60"
    >
      {{ t('categoryFilter') }}
    </span>
    <select
      class="select select-sm select-bordered text-xs"
      :class="labeled ? 'w-full' : 'max-w-32'"
      :value="activeCategoryFilter ?? ''"
      :disabled="isExam"
      :title="isExam ? t('categoryDisabledExam') : ''"
      :aria-label="t('categoryFilter')"
      @change="onCategoryChange"
    >
      <option value="">
        {{ t('allCategories') }}
      </option>
      <option
        v-for="category in allCategories"
        :key="category"
        :value="category"
      >
        {{ category }}
      </option>
    </select>
  </label>
</template>
