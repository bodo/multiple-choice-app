import { onMounted, onUnmounted } from 'vue'

type SwipeDirection = 'left' | 'right' | 'up' | 'down'

const SWIPE_THRESHOLD = 50

export function useSwipe(onSwipe: (dir: SwipeDirection) => void): void {
  let startX = 0
  let startY = 0

  function handleTouchStart(e: TouchEvent) {
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
  }

  function handleTouchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - startX
    const dy = e.changedTouches[0].clientY - startY

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return

    if (Math.abs(dx) > Math.abs(dy)) {
      onSwipe(dx < 0 ? 'left' : 'right')
    } else {
      onSwipe(dy < 0 ? 'up' : 'down')
    }
  }

  onMounted(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })
  })

  onUnmounted(() => {
    document.removeEventListener('touchstart', handleTouchStart)
    document.removeEventListener('touchend', handleTouchEnd)
  })
}
