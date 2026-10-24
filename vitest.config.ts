import { defineConfig } from 'vitest/config';

// One run covers every package; each package's vitest.config.ts sets its own environment.
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts', 'scripts/vitest.config.ts'],
    // The JSON report feeds docs/tests/STATUS.md (pnpm test:status).
    reporters: ['default', ['json', { outputFile: 'reports/vitest.json' }]],
    coverage: { provider: 'v8', reporter: ['text-summary', 'html'], reportsDirectory: 'reports/coverage' },
  },
});
