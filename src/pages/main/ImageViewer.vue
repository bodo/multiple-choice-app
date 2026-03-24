<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import OpenSeadragon from 'openseadragon'

const props = defineProps<{ src: string }>()

const container = ref<HTMLDivElement | null>(null)
let viewer: OpenSeadragon.Viewer | null = null

function initViewer() {
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

onMounted(initViewer)
watch(() => props.src, initViewer)
onUnmounted(() => viewer?.destroy())
</script>

<template>
  <div
    ref="container"
    class="w-full h-64 bg-base-200 rounded"
  />
</template>
