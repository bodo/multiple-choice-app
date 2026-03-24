import { createRouter, createWebHistory } from 'vue-router'
import MainPage from '../pages/main/MainPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: MainPage },
  ],
})
