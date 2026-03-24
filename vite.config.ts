import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: "Bodo's Multiple Choice",
        short_name: 'Practice',
        description: 'Multiple choice practice app',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
      },
    }),
  ],
})
