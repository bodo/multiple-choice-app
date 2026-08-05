<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Eye, EyeOff, X } from 'lucide-vue-next'
import type { Exercise } from '../../entities/exercise/exercise'
import MarkdownRenderer from '../../dumb/MarkdownRenderer.vue'
import ImageViewer from '../../dumb/ImageViewer.vue'

const props = defineProps<{ exercise: Exercise | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const dialog = ref<HTMLDialogElement | null>(null)
const answerVisible = ref(false)
const checkmark = '\u2713'

watch(() => props.exercise?.id, () => {
  answerVisible.value = false
})

watch(() => props.exercise, async (exercise) => {
  await nextTick()
  if (exercise && dialog.value && !dialog.value.open) {
    dialog.value.showModal()
  } else if (!exercise && dialog.value?.open) {
    dialog.value.close()
  }
}, { immediate: true })

const correctIndices = computed(() => {
  const correct = props.exercise?.correct
  return Array.isArray(correct) && correct.every(value => typeof value === 'number')
    ? new Set(correct)
    : new Set<number>()
})

const correctTextAnswers = computed(() => {
  const correct = props.exercise?.correct
  return Array.isArray(correct) && correct.every(value => typeof value === 'string')
    ? correct
    : []
})

const isChoiceMode = computed(() =>
  props.exercise?.inputMode === 'SINGLE_CHOICE'
  || props.exercise?.inputMode === 'MULTIPLE_CHOICE')

function matchAnswer(rowIndex: number): string {
  const exercise = props.exercise
  if (!exercise || exercise.inputMode !== 'MATCH') return ''
  const correct = exercise.correct as number[]
  return exercise.matchOptions?.[correct[rowIndex]] ?? ''
}
</script>

<template>
  <dialog
    ref="dialog"
    class="modal"
    :aria-labelledby="exercise ? 'exercise-preview-title' : undefined"
    @cancel.prevent="emit('close')"
  >
    <div
      v-if="exercise"
      class="modal-box max-w-3xl max-h-[90dvh] p-0 flex flex-col"
    >
      <div class="flex items-start gap-3 p-4 border-b border-base-300">
        <div class="flex-1 min-w-0">
          <p class="text-xs font-mono text-base-content/50">
            {{ exercise.id }}
          </p>
          <h2
            id="exercise-preview-title"
            class="font-semibold"
          >
            {{ t('cardPreviewTitle') }}
          </h2>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          :aria-label="t('close')"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>
      </div>

      <div class="overflow-y-auto p-4 flex flex-col gap-4">
        <div class="flex flex-wrap gap-1">
          <span
            v-for="category in exercise.categories"
            :key="category"
            class="badge badge-ghost badge-sm"
          >
            {{ category }}
          </span>
        </div>

        <div v-if="exercise.instruction">
          <MarkdownRenderer :content="exercise.instruction" />
        </div>
        <ImageViewer
          v-for="image in exercise.images"
          :key="image"
          :src="`/data/img/${image}`"
        />

        <div
          v-if="isChoiceMode && exercise.answerOptions"
          class="flex flex-col gap-2"
        >
          <div
            v-for="(option, index) in exercise.answerOptions"
            :key="index"
            class="rounded-lg border px-3 py-2"
            :class="answerVisible && correctIndices.has(index)
              ? 'border-success bg-success/10'
              : 'border-base-300 bg-base-200/40'"
          >
            <div class="flex gap-2">
              <span
                v-if="answerVisible && correctIndices.has(index)"
                class="text-success font-bold"
              >{{ checkmark }}</span>
              <div class="flex-1 min-w-0">
                <MarkdownRenderer :content="option" />
              </div>
            </div>
            <div
              v-if="answerVisible && exercise.explainAnswerOptions?.[index]"
              class="mt-2 pt-2 border-t border-base-300 text-sm text-base-content/70"
            >
              <MarkdownRenderer :content="exercise.explainAnswerOptions[index]" />
            </div>
          </div>
        </div>

        <div
          v-else-if="exercise.inputMode === 'MATCH' && exercise.answerOptions"
          class="flex flex-col gap-2"
        >
          <div
            v-for="(option, index) in exercise.answerOptions"
            :key="index"
            class="rounded-lg border border-base-300 bg-base-200/40 px-3 py-2"
          >
            <MarkdownRenderer :content="option" />
            <div
              v-if="answerVisible"
              class="mt-2 pt-2 border-t border-base-300 text-success"
            >
              <MarkdownRenderer :content="matchAnswer(index)" />
            </div>
          </div>
        </div>

        <div
          v-else-if="answerVisible"
          class="alert alert-success"
        >
          <div>
            <p class="text-xs font-semibold">
              {{ t('correctAnswer') }}
            </p>
            <ul v-if="correctTextAnswers.length > 0">
              <li
                v-for="answer in correctTextAnswers"
                :key="answer"
              >
                {{ answer }}
              </li>
            </ul>
            <p v-else>
              {{ exercise.correct[0] }}
            </p>
          </div>
        </div>

        <div
          v-if="answerVisible && exercise.explainInstruction"
          class="rounded-lg border border-base-300 bg-base-200/50 p-3"
        >
          <p class="mb-1 text-xs font-semibold text-base-content/60">
            {{ t('explanation') }}
          </p>
          <MarkdownRenderer :content="exercise.explainInstruction" />
        </div>

        <button
          type="button"
          class="btn btn-outline btn-sm self-start"
          @click="answerVisible = !answerVisible"
        >
          <EyeOff
            v-if="answerVisible"
            :size="16"
          />
          <Eye
            v-else
            :size="16"
          />
          {{ answerVisible ? t('hideAnswer') : t('showAnswer') }}
        </button>
      </div>

      <div class="p-4 border-t border-base-300 flex flex-wrap justify-end gap-2">
        <slot
          name="actions"
          :exercise="exercise"
        />
      </div>
    </div>
    <form
      method="dialog"
      class="modal-backdrop"
      @submit.prevent="emit('close')"
    >
      <button :aria-label="t('close')" />
    </form>
  </dialog>
</template>
