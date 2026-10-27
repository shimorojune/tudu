import { defineConfig } from '@playwright/test';

/**
 * The desktop group: Tudu Test, the real macOS app, launched once per test on a fresh data folder and driven over
 * its control channel (apps/desktop/src-tauri/src/control.rs). No browser: the app's own WKWebView runs the page.
 * One test at a time, since the global summon and the key window belong to one app at a time. `pnpm e2e:mac`
 * builds the bundles first (scripts/e2e-mac.mjs).
 */
export const API_PORT = process.env.MAC_API_PORT ?? '3713';
export const WEB_PORT = process.env.MAC_WEB_PORT ?? '5713';
/** A stand-in for the web that a test can take down or slow (C11-D19); the API takes its origin too. */
export const HOLD_PORT = process.env.MAC_HOLD_PORT ?? String(Number(WEB_PORT) + 1);
const api = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: '../../../reports/playwright-mac.json' }],
    ['html', { open: 'never', outputFolder: '../../../reports/playwright-mac-html' }],
  ],
  outputDir: '../../../reports/mac-results',
  webServer: [
    {
      command: 'node packages/e2e/scripts/start-api.mjs',
      cwd: '../../..',
      url: `${api}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
      env: {
        E2E_API_PORT: API_PORT,
        E2E_WEB_PORT: WEB_PORT,
        E2E_EXTRA_ORIGINS: `http://localhost:${HOLD_PORT}`,
        // The update feed reads the fake GitHub this same API serves.
        UPDATES_TRACK: 'production',
        UPDATES_GITHUB_TOKEN: 'test-token',
        UPDATES_GITHUB_API: `${api}/__test/github`,
      },
    },
    {
      command: `pnpm --filter web exec vite build --outDir ../../.local/mac-run/web --emptyOutDir && pnpm --filter web exec vite preview --outDir ../../.local/mac-run/web --port ${WEB_PORT} --strictPort`,
      cwd: '../../..',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { VITE_API_URL: api },
    },
  ],
});
