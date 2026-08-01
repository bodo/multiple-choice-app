import { createApp } from 'vue'
import { router } from './app/router'
import { i18n } from './app/i18n'
import App from './app/App.vue'
import { migrateLegacyLocalStorage } from './db/migrateLegacyLocalStorage'
import { requestPersistentStorage } from './db/storagePersistence'
import { initializeSettings } from './entities/settings/useSettings'
import { initializeBookmarks } from './entities/exercise/useBookmarks'
import { initializeExerciseHistory } from './entities/exercise/useExerciseHistory'
import { initializeExerciseLibrary } from './entities/exercise/useExerciseLibrary'
import { initializeDailyGoal } from './entities/daily-goal/dailyGoalService'
import './style.css'

await requestPersistentStorage()
await migrateLegacyLocalStorage()
await Promise.all([
  initializeSettings(),
  initializeBookmarks(),
  initializeExerciseHistory(),
  initializeExerciseLibrary(),
  initializeDailyGoal(),
])

createApp(App).use(router).use(i18n).mount('#app')
