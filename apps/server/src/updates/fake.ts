import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';

/**
 * A fake GitHub for the update feed (TEST_ROUTES only): just the release reads the feed makes. Tests publish
 * releases with `POST /release` (assets as text, base64 or a file on this machine), and `POST /down` makes every
 * answer a 503. A request without a token is refused, as GitHub refuses one for a private repository.
 */
interface FakeAsset {
  id: number;
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
}
interface FakeRelease {
  tag: string;
  name: string;
  body: string;
  prerelease: boolean;
  publishedAt: string;
  assets: FakeAsset[];
}

export function fakeGithub() {
  const r = new Hono();
  let releases: FakeRelease[] = [];
  let down = false;
  let nextId = 1;
  let reads = 0;

  const json = (rel: FakeRelease, base: string) => ({
    tag_name: rel.tag,
    name: rel.name,
    body: rel.body,
    prerelease: rel.prerelease,
    published_at: rel.publishedAt,
    assets: rel.assets.map((a) => ({
      id: a.id,
      name: a.name,
      size: a.bytes.byteLength,
      url: `${base}/assets/${a.id}`,
    })),
  });
  const baseOf = (url: string) => {
    const u = new URL(url);
    return `${u.origin}${u.pathname.slice(0, u.pathname.indexOf('/repos/'))}`;
  };

  r.use('/repos/*', async (c, next) => {
    if (down) return c.json({ message: 'Service unavailable' }, 503);
    if (!/^Bearer \S+/.test(c.req.header('authorization') ?? ''))
      return c.json({ message: 'Not Found' }, 404);
    reads += 1;
    await next();
  });
  r.get('/repos/:owner/:repo/releases/latest', (c) => {
    const rel = releases.filter((x) => !x.prerelease).at(-1);
    return rel ? c.json(json(rel, baseOf(c.req.url))) : c.json({ message: 'Not Found' }, 404);
  });
  r.get('/repos/:owner/:repo/releases/tags/:tag', (c) => {
    const rel = releases.filter((x) => x.tag === c.req.param('tag')).at(-1);
    return rel ? c.json(json(rel, baseOf(c.req.url))) : c.json({ message: 'Not Found' }, 404);
  });
  r.get('/assets/:id', (c) => {
    if (down) return c.json({ message: 'Service unavailable' }, 503);
    if (!/^Bearer \S+/.test(c.req.header('authorization') ?? ''))
      return c.json({ message: 'Not Found' }, 404);
    const id = Number(c.req.param('id'));
    const a = releases.flatMap((x) => x.assets).find((x) => x.id === id);
    if (!a) return c.json({ message: 'Not Found' }, 404);
    return new Response(a.bytes, { headers: { 'content-type': 'application/octet-stream' } });
  });

  r.post('/release', async (c) => {
    const b = await c.req.json<{
      tag: string;
      name?: string;
      body?: string;
      prerelease?: boolean;
      assets?: Array<{ name: string; text?: string; base64?: string; file?: string }>;
    }>();
    const assets: FakeAsset[] = [];
    for (const a of b.assets ?? []) {
      const bytes =
        a.file !== undefined
          ? new Uint8Array(await readFile(a.file))
          : a.base64 !== undefined
            ? new Uint8Array(Buffer.from(a.base64, 'base64'))
            : new Uint8Array(new TextEncoder().encode(a.text ?? ''));
      assets.push({ id: nextId++, name: a.name, bytes });
    }
    // A tag published again replaces the old one (the rolling staging pre-release).
    releases = releases.filter((x) => x.tag !== b.tag);
    releases.push({
      tag: b.tag,
      name: b.name ?? b.tag,
      body: b.body ?? '',
      prerelease: !!b.prerelease,
      publishedAt: new Date().toISOString(),
      assets,
    });
    return c.json({ ok: true });
  });
  r.post('/down', async (c) => {
    down = ((await c.req.json().catch(() => ({}))) as { down?: boolean }).down ?? true;
    return c.json({ down });
  });
  r.get('/reads', (c) => c.json({ reads }));
  r.delete('/releases', (c) => {
    releases = [];
    down = false;
    return c.json({ ok: true });
  });
  return r;
}
