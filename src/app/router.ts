import { createRouter, createWebHistory } from 'vue-router'
import MainPage from '../pages/main/MainPage.vue'
import SettingsPage from '../pages/settings/SettingsPage.vue'
import StatsPage from '../pages/stats/StatsPage.vue'
import BookmarksPage from '../pages/bookmarks/BookmarksPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: MainPage },
    { path: '/settings', component: SettingsPage },
    { path: '/stats', component: StatsPage },
    { path: '/bookmarks', component: BookmarksPage },
  ],
})
