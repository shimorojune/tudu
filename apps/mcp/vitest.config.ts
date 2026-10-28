import { defineConfig } from 'vitest/config';

// The MCP server's tests. The end-to-end ones run the real API in-process on a throwaway database, as the
// server's own tests do (its global setup), with this server listening on a free port.
export default defineConfig({
  test: {
    name: 'mcp',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['../server/test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: { SKYBRIDGE_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' },
  },
});
