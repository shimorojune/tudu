import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the built web app served by Vite preview (or a running dev server when
 * E2E_BASE_URL is set). Chromium only for now. Every test is independent: it makes its own data and never
 * relies on another test having run. Reduced motion is on so no assertion lands mid-animation.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: '../../reports/playwright.json' }],
    ['html', { open: 'never', outputFolder: '../../reports/playwright-html' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 834, height: 1112 }, hasTouch: true },
    },
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  // The API on a throwaway database, then the built web app. With E2E_BASE_URL set (staging) nothing is started.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'node packages/e2e/scripts/start-api.mjs',
          cwd: '../..',
          url: 'http://localhost:3456/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
        },
        {
          command: 'pnpm --filter web build && pnpm --filter web preview',
          cwd: '../..',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: { VITE_API_URL: 'http://localhost:3456' },
        },
      ],
});
