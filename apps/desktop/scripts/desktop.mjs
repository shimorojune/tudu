#!/usr/bin/env node
// Build or run the macOS app.
//
//   pnpm desktop:dev                                  Tudu against your local API (Vite on 5173, API on 3456)
//   pnpm desktop:build --track staging                Tudu Staging, signed for the updater
//   pnpm desktop:build --track production             Tudu, signed for the updater, with the dmg
//   pnpm desktop:build --track test [--version 0.37.1] [--pubkey key] [--debug] [--out dir]
//                                                     Tudu Test with the control channel (the desktop tests)
//
// The app carries only its loader (shell/): its windows open Tudu on the web for its track (Tudu Test: the local web
// app the harness names at launch). Updater bundles are signed with TAURI_SIGNING_PRIVATE_KEY (and _PASSWORD);
// without a key a build makes the app only.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tauriDir = join(desktop, 'src-tauri');

const TRACKS = {
  production: { conf: null },
  staging: { conf: 'tauri.staging.conf.json' },
  test: { conf: 'tauri.test.conf.json' },
};

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { stdio: 'inherit', ...opts, env: { ...process.env, ...opts.env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function deepMerge(a, b) {
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(b)) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? deepMerge(a[k], v) : v;
  return out;
}

const opt = args(process.argv.slice(2));
const command = opt._[0] ?? 'build';

if (command === 'dev') {
  // The window loads the Vite dev server, so the page and the API share localhost as on the web.
  const conf = join(tmpdir(), `tudu-dev-${process.pid}.json`);
  writeFileSync(
    conf,
    JSON.stringify({
      build: { devUrl: 'http://localhost:5173', beforeDevCommand: 'pnpm --filter web dev' },
      bundle: { createUpdaterArtifacts: false },
      app: {
        security: {
          capabilities: [
            {
              identifier: 'web',
              windows: ['main', 'floating'],
              remote: { urls: ['http://localhost:*/*'] },
              permissions: [
                'core:default',
                'core:window:allow-start-dragging',
                ...['app-info', 'set-signed-in', 'set-badge', 'open-external', 'save-download']
                  .concat(['show-main', 'hide-floating', 'update-check', 'update-install'])
                  .map((c) => `allow-${c}`),
              ],
            },
          ],
        },
      },
    }),
  );
  run('pnpm', ['exec', 'tauri', 'dev', '--config', conf], { cwd: desktop });
  process.exit(0);
}

const track = opt.track ?? 'production';
const t = TRACKS[track];
if (!t) throw new Error(`Unknown track ${track}: production, staging or test`);
const debug = !!opt.debug;

// 1. The app: the track's config over the base, the version when asked, signing when a key is set.
let conf = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'));
if (t.conf) conf = deepMerge(conf, JSON.parse(readFileSync(join(tauriDir, t.conf), 'utf8')));
const overlay = {};
if (t.conf) Object.assign(overlay, JSON.parse(readFileSync(join(tauriDir, t.conf), 'utf8')));
if (opt.version) overlay.version = opt.version;
// Tudu Test's updater key is the run's own (scripts/e2e-mac.mjs makes one per run).
if (opt.pubkey) overlay.plugins = deepMerge(overlay.plugins ?? {}, { updater: { pubkey: opt.pubkey } });
const signed = !!process.env.TAURI_SIGNING_PRIVATE_KEY;
if (!signed) overlay.bundle = deepMerge(overlay.bundle ?? {}, { createUpdaterArtifacts: false });
const overlayFile = join(tmpdir(), `tudu-${track}-${process.pid}.json`);
writeFileSync(overlayFile, JSON.stringify(overlay));

const bundles = track === 'test' ? 'app' : (opt.bundles ?? 'app,dmg');
const tauriArgs = ['exec', 'tauri', 'build', '--config', overlayFile, '--bundles', bundles, '--ci'];
if (track === 'test') tauriArgs.push('--features', 'control');
if (debug) tauriArgs.push('--debug');
run('pnpm', tauriArgs, { cwd: desktop });
rmSync(overlayFile, { force: true });

// 2. Where the bundle landed, copied out when asked.
const product = conf.productName;
const bundleDir = join(tauriDir, 'target', debug ? 'debug' : 'release', 'bundle');
const app = join(bundleDir, 'macos', `${product}.app`);
if (!existsSync(app)) throw new Error(`No bundle at ${app}`);
const made = { app };
if (signed) {
  made.update = join(bundleDir, 'macos', `${product}.app.tar.gz`);
  made.signature = `${made.update}.sig`;
}
if (bundles.includes('dmg')) {
  // This build's (an earlier version's may still be in the folder).
  const dmg = readdirSync(join(bundleDir, 'dmg')).find(
    (f) => f.endsWith('.dmg') && (!opt.version || f.includes(`_${opt.version}_`)),
  );
  if (dmg) made.dmg = join(bundleDir, 'dmg', dmg);
}
if (opt.out) {
  const out = resolve(opt.out);
  mkdirSync(out, { recursive: true });
  for (const [k, p] of Object.entries(made)) {
    const to = join(out, p.split('/').pop());
    rmSync(to, { recursive: true, force: true });
    cpSync(p, to, { recursive: true, verbatimSymlinks: true });
    made[k] = to;
  }
}
console.log(JSON.stringify({ track, version: opt.version ?? null, ...made }));
