<script setup lang="ts">
import { useRoute } from 'vue-router'
import {
  BarChart3,
  BookOpen,
  Bookmark,
  CircleHelp,
  Settings,
} from 'lucide-vue-next'
import { openWeakspotCount } from '../entities/exercise/useExerciseHistory'

const route = useRoute()

function itemClass(path: string): string {
  return route.path === path
    ? 'dock-active text-primary'
    : 'text-base-content/60'
}
</script>

<template>
  <nav
    class="dock dock-sm z-20 md:hidden"
    :aria-label="$t('mainNavigation')"
  >
    <RouterLink
      to="/"
      :class="itemClass('/')"
    >
      <BookOpen :size="20" />
      <span class="dock-label">{{ $t('practice') }}</span>
    </RouterLink>
    <RouterLink
      to="/stats"
      :class="itemClass('/stats')"
    >
      <span class="relative">
        <BarChart3 :size="20" />
        <span
          v-if="openWeakspotCount > 0"
          class="badge badge-warning badge-xs absolute -top-2 -right-3"
          :aria-label="$t('openWeakspotCount', { count: openWeakspotCount })"
        >
          {{ openWeakspotCount }}
        </span>
      </span>
      <span class="dock-label">{{ $t('statsTitle') }}</span>
    </RouterLink>
    <RouterLink
      to="/bookmarks"
      :class="itemClass('/bookmarks')"
    >
      <Bookmark :size="20" />
      <span class="dock-label">{{ $t('bookmarksTitle') }}</span>
    </RouterLink>
    <RouterLink
      to="/help"
      :class="itemClass('/help')"
    >
      <CircleHelp :size="20" />
      <span class="dock-label">{{ $t('helpTitle') }}</span>
    </RouterLink>
    <RouterLink
      to="/settings"
      :class="itemClass('/settings')"
    >
      <Settings :size="20" />
      <span class="dock-label">{{ $t('settingsTitle') }}</span>
    </RouterLink>
  </nav>
</template>
