import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...vueI18n.configs.recommended,
  {
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      'vue-i18n': {
        localeDir: './src/app/locales/*.json',
        messageSyntaxVersion: '^11.0.0',
      },
    },
    rules: {
      '@intlify/vue-i18n/no-raw-text': ['error', {
        ignorePattern: '^[\\s\\-·/|…]+$',
      }],
    },
  },
  {
    files: ['*.vue', '**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
)
