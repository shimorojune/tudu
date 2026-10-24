import { defineConfig } from 'vitest/config';

// The desktop app's own files checked on any machine (the Rust tests and the Mac E2E need macOS).
export default defineConfig({
  test: {
    name: 'desktop',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
