import { defineConfig } from 'vitest/config';

// The repo's own scripts (release and deploy tooling).
export default defineConfig({
  test: {
    name: 'scripts',
    environment: 'node',
    include: ['**/*.test.mjs'],
  },
});
