#!/usr/bin/env node
// Wait until a deployed Tudu answers on both halves before the smoke test: the web's /health and /sign-in and the
// API's /health. Ready is several passing rounds in a row, because a probe can pass once while Dokploy is still
// swapping containers and the route comes and goes.
// Usage: wait-ready.mjs <webUrl> <apiUrl>
// READY_INTERVAL_MS (2000), READY_ROUNDS (3) and READY_TIMEOUT_MS (180000) tune it.

const env = (name, fallback) => Number(process.env[name] ?? fallback);

const probes = (web, api) => [
  {
    name: 'web /health',
    url: `${web}/health`,
    ok: async (res) => res.ok,
  },
  {
    name: 'web /sign-in',
    url: `${web}/sign-in`,
    ok: async (res) => res.ok && (await res.text()).includes('id="root"'),
  },
  {
    name: 'api /health',
    url: `${api}/health`,
    ok: async (res) => res.ok && (await res.json().catch(() => null))?.ok === true,
  },
];

/** Resolves true once every probe passes `rounds` times in a row, false at the timeout. */
export async function waitReady(web, api, opts = {}) {
  const {
    interval = env('READY_INTERVAL_MS', 2000),
    rounds = env('READY_ROUNDS', 3),
    timeout = env('READY_TIMEOUT_MS', 180_000),
    log = console.log,
  } = opts;
  const list = probes(web.replace(/\/$/, ''), api.replace(/\/$/, ''));
  const last = new Map();
  const deadline = Date.now() + timeout;
  let streak = 0;
  for (;;) {
    let pass = true;
    for (const p of list) {
      try {
        const res = await fetch(p.url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (!(await p.ok(res))) {
          pass = false;
          last.set(p.name, `HTTP ${res.status}`);
        }
      } catch (err) {
        pass = false;
        last.set(p.name, err.cause?.code ?? err.message);
      }
    }
    streak = pass ? streak + 1 : 0;
    if (streak >= rounds) {
      log(`ready (${rounds} passing rounds in a row)`);
      return true;
    }
    if (Date.now() + interval > deadline) {
      log('not ready in time; last failure of each probe:');
      for (const [name, why] of last) log(`  ${name}: ${why}`);
      return false;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [web, api] = process.argv.slice(2);
  if (!web || !api) {
    console.error('Usage: wait-ready.mjs <webUrl> <apiUrl>');
    process.exit(1);
  }
  process.exit((await waitReady(web, api)) ? 0 : 1);
}
