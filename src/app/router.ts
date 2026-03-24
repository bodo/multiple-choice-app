import { createRouter, createWebHistory } from 'vue-router'
import MainPage from '../pages/main/MainPage.vue'
import SettingsPage from '../pages/settings/SettingsPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: MainPage },
    { path: '/settings', component: SettingsPage },
  ],
})
