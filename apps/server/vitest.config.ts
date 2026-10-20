import { defineConfig } from 'vitest/config';

// API tests run against a real throwaway database, one per run (see test/global-setup.ts), in a single worker.
export default defineConfig({
  test: {
    name: 'server',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
