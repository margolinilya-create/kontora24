import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Pre-existing patterns: many test/helper files declare unused destructure
      // bindings or skipped Promise reject handlers — allow when prefixed with `_`.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/app/routes.jsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['api/**/*.js', 'vite.config.js'],
    languageOptions: {
      globals: { ...globals.node, process: 'readonly', __dirname: 'readonly' },
    },
  },
  {
    // Vitest unit tests run in node env and use vitest globals.
    files: ['**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}', 'security/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest, vi: 'readonly' },
    },
  },
  {
    // Playwright e2e specs and config.
    files: ['e2e/**/*.{js,jsx}', 'playwright.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // k6 load tests have their own runtime globals.
    files: ['load/**/*.js'],
    languageOptions: {
      globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly' },
    },
  },
])
