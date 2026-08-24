import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    clearMocks: true,
    include: [
      'src/**/*.{test,spec}.{js,jsx}',
      'supabase/functions/**/*.{test,spec}.{js,ts}',
    ],
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_placeholder',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx}', 'supabase/functions/_shared/**/*.ts'],
      exclude: [
        'src/main.jsx',
        'src/test/**',
        'src/**/__mocks__/**',
        'src/**/*.{test,spec}.{js,jsx}',
        'supabase/functions/**/*.{test,spec}.{js,ts}',
      ],
      thresholds: {
        lines: 92,
        functions: 90,
        branches: 87,
        statements: 92,
        // Money and policy logic must stay fully covered — a regression here
        // means guests are refunded or charged the wrong amount.
        'src/lib/cancellationPolicy.js': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        'supabase/functions/_shared/booking.ts': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  },
})
