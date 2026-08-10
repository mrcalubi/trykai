import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const HOST = '127.0.0.1'
const BASE_URL = `http://${HOST}:${PORT}`

// The end-to-end suite runs against a real production build with the Supabase
// and Stripe network calls stubbed at the browser, so it needs no live backend.
// These values only have to be well-formed, never real.
const buildEnv = {
  VITE_SUPABASE_URL: 'https://e2e.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
  VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_e2e',
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Both projects run on Chromium so CI only downloads one browser. TryKai is
  // mobile-first, so the phone viewport is not optional. See TESTING.md for how
  // to add WebKit or Firefox if the extra CI minutes become worthwhile.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    // Bind explicitly: Vite's default `localhost` resolves to IPv6 on Windows,
    // which leaves Playwright polling an address nothing is listening on.
    command: `npm run build && npm run preview -- --host ${HOST} --port ${PORT} --strictPort`,
    url: BASE_URL,
    env: buildEnv,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
