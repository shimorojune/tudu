import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { waitReady } from './wait-ready.mjs';

// One local server plays both halves; `answer(path, round)` scripts each probe per round.
let server;
async function serve(answer) {
  const hits = new Map();
  server = createServer((req, res) => {
    const n = (hits.get(req.url) ?? 0) + 1;
    hits.set(req.url, n);
    const [status, body] = answer(req.url, n);
    res.writeHead(status).end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { web: base, api: `${base}/api`, hits };
}
const up = (url) =>
  url === '/sign-in'
    ? [200, '<div id="root"></div>']
    : url === '/api/health'
      ? [200, '{"ok":true}']
      : [200, 'ok'];
const fast = (logs = []) => ({ interval: 5, rounds: 3, timeout: 500, log: (l) => logs.push(l) });

afterEach(() => new Promise((r) => (server ? server.close(r) : r())));

describe('scripts/wait-ready', () => {
  it('C01-U09 all probes pass from the start: ready after exactly 3 rounds', async () => {
    const { web, api, hits } = await serve(up);
    expect(await waitReady(web, api, fast())).toBe(true);
    expect(hits.get('/health')).toBe(3);
  });

  it('C01-U10 web /health 404s for 2 rounds: ready only after 3 passes from round 3', async () => {
    const { web, api, hits } = await serve((url, n) => (url === '/health' && n <= 2 ? [404, ''] : up(url)));
    expect(await waitReady(web, api, fast())).toBe(true);
    expect(hits.get('/health')).toBe(5);
  });

  it('C01-U11 a failure mid-streak resets the count', async () => {
    const { web, api, hits } = await serve((url, n) =>
      url === '/api/health' && n === 3 ? [404, ''] : up(url),
    );
    expect(await waitReady(web, api, fast())).toBe(true);
    expect(hits.get('/api/health')).toBe(6);
  });

  it('C01-U12 /sign-in without the app root counts as a failure', async () => {
    const { web, api } = await serve((url) => (url === '/sign-in' ? [200, '<h1>Bad gateway</h1>'] : up(url)));
    expect(await waitReady(web, api, fast())).toBe(false);
  });

  it('C01-U13 the API answering { ok: false } counts as a failure', async () => {
    const { web, api } = await serve((url) => (url === '/api/health' ? [200, '{"ok":false}'] : up(url)));
    expect(await waitReady(web, api, fast())).toBe(false);
  });

  it('C01-U14 the API never comes up: gives up at the timeout and names the probe and its status', async () => {
    const logs = [];
    const { web, api } = await serve((url) => (url === '/api/health' ? [503, ''] : up(url)));
    expect(await waitReady(web, api, fast(logs))).toBe(false);
    expect(logs.join('\n')).toContain('api /health: HTTP 503');
    expect(logs.join('\n')).not.toContain('web /health');
  });

  it('C01-U15 connection refused on the web is a failure, not a crash, and is reported', async () => {
    const logs = [];
    // A port that was just free: bind it, then close it.
    const spare = createServer();
    await new Promise((r) => spare.listen(0, '127.0.0.1', r));
    const closed = `http://127.0.0.1:${spare.address().port}`;
    await new Promise((r) => spare.close(r));
    const { api } = await serve(up);
    expect(await waitReady(closed, api, fast(logs))).toBe(false);
    expect(logs.join('\n')).toContain('web /health: ECONNREFUSED');
  });
});
