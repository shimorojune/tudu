#!/usr/bin/env node
// The desktop group: the real macOS app (Tudu Test) driven over its control channel.
//
//   pnpm e2e:mac                    build Tudu Test twice (this version and one patch up), then run every D case
//   pnpm e2e:mac -g C11-D03         one case (the bundles are built again only when --build is passed or none exist)
//   pnpm e2e:mac --build            build again even when bundles are there
//
// Each run makes a throwaway updater key; both bundles are signed with it, so the update cases install a real,
// signed update. Bundles land in .local/mac-run (run.json says where).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const RUN = join(ROOT, '.local/mac-run');
const args = process.argv.slice(2);
const rebuild = args.includes('--build');
const rest = args.filter((a) => a !== '--build');

function bump(v) {
  const [a, b, c] = v.split('-')[0].split('.').map(Number);
  return `${a}.${b}.${c + 1}`;
}

function build() {
  rmSync(RUN, { recursive: true, force: true });
  mkdirSync(RUN, { recursive: true });
  const desktop = join(ROOT, 'apps/desktop');
  const key = join(RUN, 'updater.key');
  execFileSync('pnpm', ['exec', 'tauri', 'signer', 'generate', '--ci', '-p', '', '-w', key], {
    cwd: desktop,
    stdio: 'inherit',
  });
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const next = bump(version);
  const env = {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: readFileSync(key, 'utf8'),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
  };
  const pubkey = readFileSync(`${key}.pub`, 'utf8').trim();
  const made = {};
  for (const [name, v] of [
    ['current', version],
    ['next', next],
  ]) {
    const r = spawnSync(
      'node',
      [
        'scripts/desktop.mjs',
        ...['build', '--track', 'test', '--debug', '--version', v, '--pubkey', pubkey],
        ...['--out', join(RUN, name)],
      ],
      { cwd: desktop, env, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
    );
    if (r.status !== 0) {
      process.stdout.write(r.stdout ?? '');
      process.exit(r.status ?? 1);
    }
    made[name] = { version: v, ...JSON.parse(r.stdout.trim().split('\n').at(-1)) };
  }
  const run = { ...made, pubkey };
  writeFileSync(join(RUN, 'run.json'), JSON.stringify(run, null, 2));
  console.log(`Tudu Test ${version} and ${next} built in ${RUN}`);
}

if (rebuild || !existsSync(join(RUN, 'run.json'))) build();

const result = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '--config', 'mac/playwright.config.ts', ...rest],
  {
    cwd: join(ROOT, 'packages/e2e'),
    stdio: 'inherit',
    env: process.env,
  },
);
process.exit(result.status ?? 1);
