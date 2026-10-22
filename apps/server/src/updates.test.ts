import { afterAll, describe, expect, it } from 'vitest';
import { GITHUB_TEST_API, startServer } from '../test/harness';
import { UpdateFeed, type FeedOptions } from './updates/feed';

const NOTES = '## [0.38.0](x) (2026-10-30)\n\n### Features\n\n* the floating bar';
const SIG = 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQ==';

/** A GitHub that answers from a table of paths, counting reads. */
function github(routes: Record<string, () => Response>) {
  const seen: string[] = [];
  const f: typeof fetch = async (input) => {
    const url = new URL(String(input));
    seen.push(url.pathname);
    const r = routes[url.pathname];
    return r ? r() : new Response('{"message":"Not Found"}', { status: 404 });
  };
  return { f, seen };
}
const release = (over: Partial<Record<string, unknown>> = {}) =>
  Response.json({
    tag_name: 'tudu-0.38.0',
    name: 'tudu-0.38.0',
    body: NOTES,
    published_at: '2026-10-30T09:00:00Z',
    assets: [
      { id: 1, name: 'Tudu.app.tar.gz', size: 12, url: 'https://gh.test/assets/1' },
      { id: 2, name: 'Tudu.app.tar.gz.sig', size: 40, url: 'https://gh.test/assets/2' },
      { id: 3, name: 'Tudu_0.38.0_aarch64.dmg', size: 99, url: 'https://gh.test/assets/3' },
    ],
    ...over,
  });

function feed(o: Partial<FeedOptions> & Pick<FeedOptions, 'fetch'>) {
  return new UpdateFeed({
    track: 'production',
    repo: 'eGainDev/tudu',
    token: 'ghp_test',
    api: 'https://gh.test',
    base: 'https://api.tudu.ezdev.net',
    ...o,
  });
}

describe('The update feed (chunk 11)', () => {
  it('C11-U07 the manifest from a release, per track, a release without the bundle, the five-minute cache', async () => {
    let now = 0;
    const gh = github({
      '/repos/eGainDev/tudu/releases/latest': () => release(),
      '/assets/2': () => new Response(`${SIG}\n`),
    });
    const prod = feed({ fetch: gh.f, now: () => now });
    expect(await prod.manifest()).toEqual({
      version: '0.38.0',
      notes: NOTES,
      pub_date: '2026-10-30T09:00:00Z',
      platforms: {
        'darwin-aarch64': {
          signature: SIG,
          url: 'https://api.tudu.ezdev.net/updates/download/Tudu.app.tar.gz',
        },
        'darwin-aarch64-app': {
          signature: SIG,
          url: 'https://api.tudu.ezdev.net/updates/download/Tudu.app.tar.gz',
        },
      },
    });
    // Kept five minutes: no second read of GitHub until then.
    const reads = gh.seen.length;
    now = 4 * 60 * 1000;
    await prod.manifest();
    expect(gh.seen.length).toBe(reads);
    now = 5 * 60 * 1000 + 1;
    await prod.manifest();
    expect(gh.seen.length).toBe(reads * 2);

    // Staging reads the rolling pre-release, its version from the release's name.
    const st = github({
      '/repos/eGainDev/tudu/releases/tags/staging': () =>
        release({
          tag_name: 'staging',
          name: 'Tudu Staging 0.38.1-staging.140',
          assets: [
            { id: 1, name: 'Tudu Staging.app.tar.gz', size: 12, url: 'https://gh.test/assets/1' },
            { id: 2, name: 'Tudu Staging.app.tar.gz.sig', size: 40, url: 'https://gh.test/assets/2' },
          ],
        }),
      '/assets/2': () => new Response(SIG),
    });
    const staging = feed({ track: 'staging', fetch: st.f, base: 'https://api.staging.tudu.ezdev.net/' });
    const m = await staging.manifest();
    expect(m.version).toBe('0.38.1-staging.140');
    expect(m.platforms['darwin-aarch64']!.url).toBe(
      'https://api.staging.tudu.ezdev.net/updates/download/Tudu.app.tar.gz',
    );
    expect(st.seen[0]).toBe('/repos/eGainDev/tudu/releases/tags/staging');

    // A release without the bundle or its signature has no update in it.
    for (const assets of [
      [{ id: 1, name: 'Tudu.app.tar.gz', size: 1, url: 'https://gh.test/assets/1' }],
      [],
    ]) {
      const g = github({ '/repos/eGainDev/tudu/releases/latest': () => release({ assets }) });
      await expect(feed({ fetch: g.f }).manifest()).rejects.toMatchObject({ status: 404 });
    }
    // No release at all, no token, GitHub failing.
    await expect(feed({ fetch: github({}).f }).manifest()).rejects.toMatchObject({ status: 404 });
    await expect(feed({ fetch: gh.f, token: undefined }).manifest()).rejects.toMatchObject({ status: 503 });
    const broken: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(feed({ fetch: broken }).manifest()).rejects.toMatchObject({ status: 502 });
  });
});

describe('The update feed over HTTP (chunk 11)', () => {
  const server = startServer({
    UPDATES_TRACK: 'production',
    UPDATES_GITHUB_TOKEN: 'ghp_secret_value',
    UPDATES_GITHUB_API: GITHUB_TEST_API,
    BASE_URL: 'http://localhost:3456',
  });
  const noToken = startServer({ UPDATES_TRACK: 'production', UPDATES_GITHUB_API: GITHUB_TEST_API });
  const off = startServer();
  afterAll(async () => {
    await Promise.all([server.close(), noToken.close(), off.close()]);
  });
  const { app } = server;
  const publish = (tag: string, assets: Array<{ name: string; text: string }>, body = NOTES) =>
    app.request('/__test/github/release', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tag, body, assets }),
    });
  const reset = () => app.request('/__test/updates/reset', { method: 'POST' });

  it('C11-A01 the manifest for the track, 503 without a token, 502 when GitHub fails, cached until reset', async () => {
    await app.request('/__test/github/releases', { method: 'DELETE' });
    await reset();
    expect((await app.request('/updates/latest.json')).status).toBe(404);
    await publish('tudu-0.38.0', [
      { name: 'Tudu.app.tar.gz', text: 'bundle-bytes' },
      { name: 'Tudu.app.tar.gz.sig', text: SIG },
    ]);
    // Nothing yet was kept (the 404 is not cached).
    let res = await app.request('/updates/latest.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const m = (await res.json()) as {
      version: string;
      platforms: Record<string, { url: string; signature: string }>;
    };
    expect(m.version).toBe('0.38.0');
    expect(m.platforms['darwin-aarch64']).toEqual({
      signature: SIG,
      url: 'http://localhost:3456/updates/download/Tudu.app.tar.gz',
    });

    // A newer release is not seen until the five minutes pass, or the test resets the feed.
    await publish('tudu-0.39.0', [
      { name: 'Tudu.app.tar.gz', text: 'newer' },
      { name: 'Tudu.app.tar.gz.sig', text: SIG },
    ]);
    expect(((await (await app.request('/updates/latest.json')).json()) as { version: string }).version).toBe(
      '0.38.0',
    );
    await reset();
    expect(((await (await app.request('/updates/latest.json')).json()) as { version: string }).version).toBe(
      '0.39.0',
    );

    // GitHub down: 502, and nothing is kept, so the next answer is fresh once it is back.
    await app.request('/__test/github/down', { method: 'POST', body: '{"down":true}' });
    await reset();
    res = await app.request('/updates/latest.json');
    expect(res.status).toBe(502);
    await app.request('/__test/github/down', { method: 'POST', body: '{"down":false}' });
    expect((await app.request('/updates/latest.json')).status).toBe(200);

    // No token: 503. No track: no feed at all.
    res = await noToken.app.request('/updates/latest.json');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Updates are not set up here.' });
    expect((await off.app.request('/updates/latest.json')).status).toBe(404);
  });

  it('C11-A02 the download streams the bundle with its size and type; other names are 404; no signature there', async () => {
    await app.request('/__test/github/releases', { method: 'DELETE' });
    await publish('tudu-0.40.0', [
      { name: 'Tudu.app.tar.gz', text: 'the-bundle' },
      { name: 'Tudu.app.tar.gz.sig', text: SIG },
    ]);
    await reset();
    const res = await app.request('/updates/download/Tudu.app.tar.gz');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/gzip');
    expect(res.headers.get('content-length')).toBe(String('the-bundle'.length));
    expect(await res.text()).toBe('the-bundle');
    for (const name of ['Tudu.app.tar.gz.sig', 'Tudu_0.40.0_aarch64.dmg', 'latest.json'])
      expect((await app.request(`/updates/download/${encodeURIComponent(name)}`)).status).toBe(404);
  });

  it('C11-A03 the feed needs no session and never shows the GitHub token', async () => {
    await app.request('/__test/github/releases', { method: 'DELETE' });
    await publish('tudu-0.41.0', [
      { name: 'Tudu.app.tar.gz', text: 'b' },
      { name: 'Tudu.app.tar.gz.sig', text: SIG },
    ]);
    await reset();
    // The app asks with no cookie and no origin (the updater is not a web page).
    const answers = [
      await app.request('/updates/latest.json'),
      await app.request('/updates/download/Tudu.app.tar.gz'),
      await noToken.app.request('/updates/latest.json'),
    ];
    for (const res of answers) {
      expect(res.status).not.toBe(401);
      const text = await res.text();
      expect(text).not.toContain('ghp_secret_value');
      for (const [, v] of res.headers) expect(v).not.toContain('ghp_secret_value');
    }
    // GitHub itself refuses a read without a token, as for a private repository.
    expect((await app.request('/__test/github/repos/eGainDev/tudu/releases/latest')).status).toBe(404);
  });
});
