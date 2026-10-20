#!/usr/bin/env node
// Run end-to-end tests by group: `pnpm e2e` (everything), `pnpm e2e kit` (one group), `pnpm e2e kit --project=phone`,
// `pnpm e2e -g C00-E01` (one case). Groups are folders under packages/e2e/tests.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const groups = [];
const rest = [];
for (const a of args) {
  if (!a.startsWith('-') && existsSync(join(ROOT, 'packages/e2e/tests', a))) groups.push(a);
  else rest.push(a);
}
const result = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', ...groups.map((g) => `tests/${g}`), ...rest],
  {
    cwd: join(ROOT, 'packages/e2e'),
    stdio: 'inherit',
    env: process.env,
  },
);
process.exit(result.status ?? 1);
