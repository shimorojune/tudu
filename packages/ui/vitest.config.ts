import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'ui',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setup-tests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
