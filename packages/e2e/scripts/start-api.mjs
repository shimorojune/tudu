#!/usr/bin/env node
// Start the API for end-to-end tests on a throwaway database that is dropped when the process ends.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const port = process.env.E2E_API_PORT ?? '3456';

// tsx runs the TypeScript helpers; this script stays plain JS so Playwright can launch it directly.
const { createTestDatabase } = await import('tsx/esm/api').then((m) =>
  m.tsImport(resolve(root, 'packages/db/src/test.ts'), import.meta.url),
);
const db = await createTestDatabase({ prefix: 'tudu_e2e' });
console.log(`e2e database ${db.name}`);

const api = spawn('node', ['--import', 'tsx', 'src/index.ts'], {
  cwd: resolve(root, 'apps/server'),
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: port,
    DATABASE_URL: db.url,
    AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret',
    BASE_URL: `http://localhost:${port}`,
    // The desktop tests add the app's origin (tauri://localhost).
    CORS_ORIGINS: [`http://localhost:${process.env.E2E_WEB_PORT ?? '5173'}`, process.env.E2E_EXTRA_ORIGINS]
      .filter(Boolean)
      .join(','),
    EMAIL_TRANSPORT: 'outbox',
    TEST_ROUTES: '1',
    // Send feedback mails each report here; the tests read it from the outbox.
    FEEDBACK_TO: 'reports@tudu.test',
    // Attachments: the CI runner has a RustFS bucket; a laptop without Docker keeps them in memory.
    ...(process.env.TUDU_CI_S3_ENDPOINT
      ? {
          STORAGE_DRIVER: 's3',
          S3_ENDPOINT: process.env.TUDU_CI_S3_ENDPOINT,
          S3_BUCKET: process.env.TUDU_CI_S3_BUCKET ?? 'tudu-ci',
          S3_ACCESS_KEY_ID: process.env.TUDU_CI_S3_ACCESS_KEY_ID,
          S3_SECRET_ACCESS_KEY: process.env.TUDU_CI_S3_SECRET_ACCESS_KEY,
        }
      : { STORAGE_DRIVER: 'memory' }),
  },
});

let closing = false;
async function stop(signal) {
  if (closing) return;
  closing = true;
  api.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  await db.drop().catch((e) => console.error('drop failed', e));
  process.exit(signal === 'SIGINT' ? 130 : 0);
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
api.on('exit', (code) => {
  if (!closing) {
    closing = true;
    db.drop().finally(() => process.exit(code ?? 1));
  }
});
