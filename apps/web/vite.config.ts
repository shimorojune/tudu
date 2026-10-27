import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cpSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// The release's version (semantic-release writes it to the root package.json), for Settings and Send feedback's app
// details. A staging build passes its own (VITE_TUDU_VERSION) and its track (VITE_TUDU_TRACK); see deploy-staging.yml.
const root = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Excalidraw's fonts, served from Tudu itself at /excalidraw/fonts/ (the drawing editor sets its asset path there), so
 * drawing works offline and never reaches a CDN. Xiaolai (13 MB of Chinese and Japanese) is left out; those scripts
 * fall back to the system's fonts.
 */
function excalidrawFonts(): Plugin {
  const ui = createRequire(fileURLToPath(new URL('../../packages/ui/package.json', import.meta.url)));
  const fonts = join(dirname(ui.resolve('@excalidraw/excalidraw')), 'fonts');
  const keep = (src: string) => !/[\\/]Xiaolai([\\/]|$)/.test(src);
  let outDir = 'dist';
  return {
    name: 'tudu-excalidraw-fonts',
    configResolved(c) {
      outDir = isAbsolute(c.build.outDir) ? c.build.outDir : join(c.root, c.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/excalidraw/fonts', (req, res, next) => {
        const file = normalize(join(fonts, decodeURIComponent((req.url ?? '').split('?')[0]!)));
        if (!file.startsWith(fonts) || !keep(file) || !existsSync(file) || !statSync(file).isFile())
          return next();
        res.setHeader('content-type', file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      cpSync(fonts, join(outDir, 'excalidraw', 'fonts'), { recursive: true, filter: keep });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), excalidrawFonts()],
  define: {
    'import.meta.env.VITE_TUDU_VERSION': JSON.stringify(process.env.VITE_TUDU_VERSION || root.version),
    'import.meta.env.VITE_TUDU_TRACK': JSON.stringify(process.env.VITE_TUDU_TRACK || ''),
  },
  server: { port: 5173, strictPort: true },
  build: { sourcemap: true },
});
