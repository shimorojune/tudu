import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

// The release's version (semantic-release writes it to the root package.json), for Settings and Send feedback's app
// details. A staging build passes its own (VITE_TUDU_VERSION) and its track (VITE_TUDU_TRACK); see deploy-staging.yml.
const root = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_TUDU_VERSION': JSON.stringify(process.env.VITE_TUDU_VERSION || root.version),
    'import.meta.env.VITE_TUDU_TRACK': JSON.stringify(process.env.VITE_TUDU_TRACK || ''),
  },
  server: { port: 5173, strictPort: true },
  build: { sourcemap: true },
});
