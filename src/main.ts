import { createApp } from 'vue'
import { router } from './app/router'
import { i18n } from './app/i18n'
import App from './app/App.vue'
import { requestPersistentStorage } from './db/storagePersistence'
import './style.css'

await requestPersistentStorage()
createApp(App).use(router).use(i18n).mount('#app')
