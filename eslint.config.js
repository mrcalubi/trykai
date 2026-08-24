import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

const vitestGlobals = {
  afterAll: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  suite: 'readonly',
  test: 'readonly',
  vi: 'readonly',
}

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results']),
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
  },
  {
    files: ['**/*.{test,spec}.{js,jsx}', 'src/test/**/*.{js,jsx}', 'src/**/__mocks__/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...vitestGlobals },
    },
    rules: {
      // Test helpers export fixtures and render functions alongside components.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['*.config.js', 'e2e/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
