import { createI18n } from 'vue-i18n'
import deu from './locales/deu.json'
import eng from './locales/eng.json'

export const i18n = createI18n({
  legacy: false,
  locale: 'eng',
  fallbackLocale: 'eng',
  messages: { deu, eng },
})
