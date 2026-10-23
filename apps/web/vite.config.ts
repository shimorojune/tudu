import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

// The release's version (semantic-release writes it to the root package.json), for Send feedback's app details.
const root = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { 'import.meta.env.VITE_TUDU_VERSION': JSON.stringify(root.version) },
  server: { port: 5173, strictPort: true },
  build: { sourcemap: true },
});
