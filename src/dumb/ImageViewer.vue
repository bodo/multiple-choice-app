<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import OpenSeadragon from 'openseadragon'

const props = defineProps<{ src: string }>()

const container = ref<HTMLDivElement | null>(null)
let viewer: OpenSeadragon.Viewer | null = null

function initializeViewer() {
  if (!container.value) return
  viewer?.destroy()
  viewer = OpenSeadragon({
    element: container.value,
    tileSources: { type: 'image', url: props.src },
    showNavigationControl: false,
    gestureSettingsMouse: { clickToZoom: true },
    minZoomLevel: 0.5,
    defaultZoomLevel: 0,
  })
}

onMounted(initializeViewer)
watch(() => props.src, initializeViewer)
onUnmounted(() => viewer?.destroy())
</script>

<template>
  <div
    ref="container"
    class="w-full h-64 bg-base-200 rounded"
  />
</template>
