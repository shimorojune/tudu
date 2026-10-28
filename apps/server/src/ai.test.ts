import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SpaceSummary, SyncResponse } from '@tudu/core';
import { and, eq, schema, sql } from '@tudu/db';
import type { ClientMetadataResourceFetch } from '@better-auth/oauth-provider';
import { get, post, signIn, startServer, type Jar } from '../test/harness';
import { sweepAccessLog } from './ai/log';

/** AI access (docs/plans/mcp-server.md): keys, apps over OAuth, and what each may reach. */

const MCP_URL = 'http://localhost:3457/mcp';
const CIMD_URL = 'https://app.example/oauth/client.json';
const CIMD_REDIRECT = 'https://app.example/callback';

/** Client metadata documents the test serves in place of the internet. */
const documents = new Map<string, () => Response>();
const fetchClientMetadata: ClientMetadataResourceFetch = (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const doc = documents.get(url);
  return doc ? doc() : new Response('not found', { status: 404 });
};
const json =
  (body: unknown, headers: Record<string, string> = {}) =>
  () =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json', 'cache-control': 'max-age=60', ...headers },
    });

let server: ReturnType<typeof startServer>;
beforeAll(() => {
  server = startServer({ MCP_URL }, { fetchClientMetadata });
});
afterAll(async () => {
  await server.close();
});

interface Person {
  jar: Jar;
  email: string;
  userId: string;
  personalId: string;
}

async function person(): Promise<Person> {
  const { jar, email } = await signIn(server);
  const me = (await (await get(server.app, '/api/me', jar)).json()) as {
    user: { id: string };
    spaces: SpaceSummary[];
  };
  return { jar, email, userId: me.user.id, personalId: me.spaces[0]!.id };
}

async function teamSpace(p: Person, name = 'Northwind'): Promise<SpaceSummary> {
  const res = await post(server.app, '/api/spaces', { name, color: '#3d5a80', invites: [] }, p.jar);
  expect(res.status).toBe(201);
  return ((await res.json()) as { space: SpaceSummary }).space;
}

const as = (bearer: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${bearer}`,
  ...extra,
});
const getAs = (path: string, bearer: string) => server.app.request(path, { headers: as(bearer) });
const postAs = (path: string, body: unknown, bearer: string) =>
  server.app.request(path, {
    method: 'POST',
    headers: as(bearer, { 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
const del = (path: string, jar: Jar) =>
  server.app.request(path, {
    method: 'DELETE',
    headers: { origin: 'http://localhost:5173', cookie: jar.header() },
  });

let clock = Date.parse('2026-10-28T09:00:00.000Z');
function m(type: string, payload: Record<string, unknown>) {
  clock += 1000;
  return { id: randomUUID(), type, payload, at: new Date(clock).toISOString() };
}
const createTask = (spaceId: string, title: string, id = randomUUID()) =>
  m('task.create', { id, spaceId, title, day: '2026-10-28', position: null });

async function syncAs(bearer: string, mutations: unknown[]): Promise<Response> {
  return postAs('/api/sync', { clientId: 'mcp-test', mutations }, bearer);
}
async function syncJar(p: Person, mutations: unknown[]): Promise<SyncResponse> {
  const res = await post(server.app, '/api/sync', { clientId: 'tab-1', mutations }, p.jar);
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

async function makeKey(
  p: Person,
  body: Record<string, unknown>,
): Promise<{ key: string; row: { id: string } }> {
  const res = await post(
    server.app,
    '/api/keys',
    { name: `Key ${randomUUID().slice(0, 6)}`, ...body },
    p.jar,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { key: string; row: { id: string } };
}

const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

// OAuth, as an MCP client does it.

const b64url = (b: Buffer) => b.toString('base64url');
function pkce() {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}

let ip = 0;
/** Dynamic client registration, each from its own address so the hourly limit stays per test. */
async function register(body: Record<string, unknown> = {}, from = `10.0.0.${++ip}`) {
  return server.app.request('/api/auth/oauth2/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': from },
    body: JSON.stringify({
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      ...body,
    }),
  });
}
async function newClient(
  body: Record<string, unknown> = {},
): Promise<{ clientId: string; redirect: string }> {
  const res = await register(body);
  expect(res.status, await res.clone().text()).toBeLessThan(300);
  const out = (await res.json()) as { client_id: string; redirect_uris: string[] };
  return { clientId: out.client_id, redirect: out.redirect_uris[0]! };
}

/** Where a redirect (302 or Better Auth's JSON form) sends you. */
async function whereTo(res: Response): Promise<URL> {
  const loc = res.headers.get('location');
  if (loc) return new URL(loc, 'http://localhost:3456');
  const body = (await res.json()) as { url?: string };
  expect(body.url, 'a redirect').toBeTruthy();
  return new URL(body.url!);
}

async function authorize(
  p: Person,
  client: { clientId: string; redirect: string },
  opts: { challenge: string; method?: string; resource?: string; state?: string },
): Promise<URL> {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirect,
    scope: 'offline_access',
    state: opts.state ?? 'st-1',
    code_challenge: opts.challenge,
    code_challenge_method: opts.method ?? 'S256',
    resource: opts.resource ?? MCP_URL,
  });
  return whereTo(await get(server.app, `/api/auth/oauth2/authorize?${q}`, p.jar));
}

async function allow(p: Person, consent: URL, reach: Record<string, unknown>): Promise<URL> {
  const res = await post(server.app, '/api/oauth/allow', { query: consent.search.slice(1), reach }, p.jar);
  expect(res.status, await res.clone().text()).toBe(200);
  return new URL(((await res.json()) as { url: string }).url);
}

async function tokenCall(body: Record<string, string>): Promise<Response> {
  return server.app.request('/api/auth/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/** The whole dance: register, authorize, allow with `reach`, swap the code. */
async function connect(
  p: Person,
  reach: Record<string, unknown> = { level: 'write' },
  client?: { clientId: string; redirect: string },
): Promise<{ client: { clientId: string; redirect: string }; tokens: Tokens }> {
  const c = client ?? (await newClient());
  const { verifier, challenge } = pkce();
  const consent = await authorize(p, c, { challenge });
  expect(consent.pathname).toBe('/oauth/consent');
  const back = await allow(p, consent, reach);
  const code = back.searchParams.get('code');
  expect(code, back.href).toBeTruthy();
  expect(back.searchParams.get('state')).toBe('st-1');
  const res = await tokenCall({
    grant_type: 'authorization_code',
    code: code!,
    redirect_uri: c.redirect,
    client_id: c.clientId,
    code_verifier: verifier,
    resource: MCP_URL,
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return { client: c, tokens: (await res.json()) as Tokens };
}

describe('AI access: keys', () => {
  it('MCP-U01 a new key is tudu_ and 43 characters; only its hash is kept; 90 days unless told', async () => {
    const p = await person();
    const { key, row } = await makeKey(p, { level: 'read' });
    expect(key).toMatch(/^tudu_[A-Za-z0-9_-]{43}$/);
    const [stored] = await server.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, row.id));
    expect(stored!.hash).toBe(createHash('sha256').update(key).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(key);
    expect(stored!.start).toBe(key.slice(5, 9));
    const days = (stored!.expiresAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThanOrEqual(90);

    const never = await makeKey(p, { level: 'read', days: null });
    const [n] = await server.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, never.row.id));
    expect(n!.expiresAt).toBeNull();
  });

  it('MCP-U02 a key stands for its person until revoked or out of date; last used is written once a minute', async () => {
    const p = await person();
    const { key, row } = await makeKey(p, { level: 'read' });
    const res = await getAs('/api/access', key);
    expect(res.status).toBe(200);
    const who = (await res.json()) as { user: { id: string }; access: { kind: string; id: string } };
    expect(who.user.id).toBe(p.userId);
    expect(who.access).toMatchObject({ kind: 'key', id: row.id, level: 'read' });

    const [first] = await server.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, row.id));
    expect(first!.lastUsedAt).not.toBeNull();
    await getAs('/api/me', key);
    const [second] = await server.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, row.id));
    expect(second!.lastUsedAt!.getTime()).toBe(first!.lastUsedAt!.getTime());

    expect((await getAs('/api/me', 'tudu_' + 'x'.repeat(43))).status).toBe(401);

    const old = await makeKey(p, { level: 'read' });
    await server.db
      .update(schema.apiKeys)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.apiKeys.id, old.row.id));
    expect((await getAs('/api/me', old.key)).status).toBe(401);
  });

  it('MCP-U03 a read key reads the listed routes; changes and account routes are refused with the reason', async () => {
    const p = await person();
    const { key } = await makeKey(p, { level: 'read' });
    for (const path of [
      '/api/me',
      `/api/spaces/${p.personalId}/days/2026-10-28`,
      `/api/spaces/${p.personalId}/backlog`,
      '/api/search?q=plan',
      '/api/inbox',
      '/api/notebook',
    ])
      expect((await getAs(path, key)).status, path).toBe(200);

    const write = await syncAs(key, [createTask(p.personalId, 'Nope')]);
    expect(write.status).toBe(403);
    expect(await errorOf(write)).toBe('This key can only read.');
    for (const path of ['/api/keys', '/api/apps', `/api/spaces/${p.personalId}/members`]) {
      const res = await getAs(path, key);
      expect(res.status, path).toBe(403);
      expect(await errorOf(res)).toBe('A key can’t do that. Sign in to Tudu to do it.');
    }
  });

  it('MCP-U04 a write key without delete adds but can’t delete; account and space settings never', async () => {
    const p = await person();
    const { key } = await makeKey(p, { level: 'write' });
    const id = randomUUID();
    const res = await syncAs(key, [createTask(p.personalId, 'From Claude', id)]);
    expect(res.status).toBe(200);
    expect(((await res.json()) as SyncResponse).results[0]!.status).toBe('ok');

    const gone = await syncAs(key, [m('task.delete', { id })]);
    expect(gone.status).toBe(403);
    expect(await errorOf(gone)).toBe('This key can’t delete.');
    for (const change of [
      m('me.rename', { name: 'Mallory' }),
      m('space.update', { id: p.personalId, name: 'Taken' }),
    ]) {
      const r = await syncAs(key, [change]);
      expect(r.status).toBe(403);
      expect(await errorOf(r)).toBe('This key can’t change account or space settings.');
    }

    const can = await makeKey(p, { level: 'write', canDelete: true });
    expect((await syncAs(can.key, [m('task.delete', { id })])).status).toBe(200);
  });

  it('MCP-U05 a key for some spaces sees only those: other spaces refused, crossing answers narrowed', async () => {
    const p = await person();
    const team = await teamSpace(p);
    const out = await syncJar(p, [createTask(team.id, 'Team plan'), createTask(p.personalId, 'My plan')]);
    const teamRef = out.tasks.find((t) => t.spaceId === team.id)!.ref!;
    const { key } = await makeKey(p, { level: 'write', spaces: [p.personalId] });

    const day = await getAs(`/api/spaces/${team.id}/days/2026-10-28`, key);
    expect(day.status).toBe(403);
    expect(await errorOf(day)).toBe('This key can’t reach that space.');
    const me = (await (await getAs('/api/me', key)).json()) as { spaces: Array<{ id: string }> };
    expect(me.spaces.map((s) => s.id)).toEqual([p.personalId]);
    const found = (await (await getAs('/api/search?q=plan', key)).json()) as {
      hits: Array<{ spaceId: string }>;
    };
    expect(found.hits.length).toBeGreaterThan(0);
    expect(found.hits.every((h) => h.spaceId === p.personalId)).toBe(true);
    const ref = await getAs(`/api/tasks/ref/${teamRef}`, key);
    expect(ref.status).toBe(404);
    expect(await errorOf(ref)).toBe('No task with that ID.');
    expect((await getAs('/api/inbox', key)).status).toBe(403);
    const elsewhere = await syncAs(key, [createTask(team.id, 'Sneaky')]);
    expect(elsewhere.status).toBe(403);
    expect(await errorOf(elsewhere)).toBe('This key can’t reach that space.');
  });

  it('MCP-U06 with the Notebook off, notes are neither read nor changed, and search leaves them out', async () => {
    const p = await person();
    await syncJar(p, [
      m('note.create', { id: randomUUID(), folderId: null, title: 'Plan', html: '<p>plan</p>' }),
    ]);
    const { key } = await makeKey(p, { level: 'write', notebook: false });
    const nb = await getAs('/api/notebook', key);
    expect(nb.status).toBe(403);
    expect(await errorOf(nb)).toBe('This key can’t read your Notebook.');
    const note = await syncAs(key, [
      m('note.create', { id: randomUUID(), folderId: null, title: 'X', html: '' }),
    ]);
    expect(note.status).toBe(403);
    expect(await errorOf(note)).toBe('This key can’t change your Notebook.');
    const found = (await (await getAs('/api/search?q=plan', key)).json()) as { notes?: unknown };
    expect(found.notes).toBeUndefined();
  });

  it('MCP-A01 the key is shown once, never listed; names are unique; spaces must be yours; keys can’t make keys', async () => {
    const p = await person();
    const res = await post(server.app, '/api/keys', { name: 'Raycast', level: 'read' }, p.jar);
    expect(res.status).toBe(201);
    const { key } = (await res.json()) as { key: string };
    const list = await (await get(server.app, '/api/keys', p.jar)).text();
    expect(list).toContain('Raycast');
    expect(list).not.toContain(key);

    const again = await post(server.app, '/api/keys', { name: 'raycast', level: 'read' }, p.jar);
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toBe('You already have a key called “raycast”.');

    const other = await person();
    const theirs = await post(
      server.app,
      '/api/keys',
      { name: 'Theirs', level: 'read', spaces: [other.personalId] },
      p.jar,
    );
    expect(theirs.status).toBe(403);

    const byKey = await postAs('/api/keys', { name: 'Spawn', level: 'read' }, key);
    expect(byKey.status).toBe(403);
  });

  it('MCP-A02 revoking a key stops it on the next call; someone else’s key is not found', async () => {
    const p = await person();
    const { key, row } = await makeKey(p, { level: 'read' });
    const other = await person();
    expect((await del(`/api/keys/${row.id}`, other.jar)).status).toBe(404);
    expect((await getAs('/api/me', key)).status).toBe(200);
    expect((await del(`/api/keys/${row.id}`, p.jar)).status).toBe(204);
    const after = await getAs('/api/me', key);
    expect(after.status).toBe(401);
    expect(await errorOf(after)).toBe('That key isn’t valid. It may have been revoked or run out.');
  });

  it('makes at most ten keys an hour', async () => {
    const p = await person();
    for (let i = 0; i < 10; i++) await makeKey(p, { level: 'read' });
    const res = await post(server.app, '/api/keys', { name: 'Eleventh', level: 'read' }, p.jar);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});

describe('AI access: apps (OAuth)', () => {
  it('serves the authorization server metadata where MCP clients look, PKCE S256 only', async () => {
    for (const path of [
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-authorization-server/api/auth',
    ]) {
      const res = await server.app.request(path);
      expect(res.status, path).toBe(200);
      const meta = (await res.json()) as Record<string, unknown>;
      expect(meta.issuer).toBe('http://localhost:3456/api/auth');
      expect(meta.code_challenge_methods_supported).toEqual(['S256']);
      expect(meta.registration_endpoint).toBe('http://localhost:3456/api/auth/oauth2/register');
      expect(meta.client_id_metadata_document_supported).toBe(true);
    }
  });

  it('MCP-A03 authorize with PKCE, allow a narrowed grant, swap the code: the token reaches that grant only', async () => {
    const p = await person();
    const team = await teamSpace(p);
    const { tokens } = await connect(p, { level: 'read', spaces: [p.personalId], notebook: false });
    expect(tokens.access_token.startsWith('tuduat_')).toBe(true);
    expect(tokens.refresh_token?.startsWith('tudurt_')).toBe(true);
    expect(tokens.expires_in).toBe(3600);

    const who = (await (await getAs('/api/access', tokens.access_token)).json()) as {
      user: { id: string };
      access: Record<string, unknown>;
    };
    expect(who.user.id).toBe(p.userId);
    expect(who.access).toMatchObject({ kind: 'app', name: 'Claude', level: 'read', spaces: [p.personalId] });
    expect((await getAs(`/api/spaces/${p.personalId}/backlog`, tokens.access_token)).status).toBe(200);
    const team403 = await getAs(`/api/spaces/${team.id}/backlog`, tokens.access_token);
    expect(team403.status).toBe(403);
    expect(await errorOf(team403)).toBe('This app can’t reach that space.');
    const write = await syncAs(tokens.access_token, [createTask(p.personalId, 'x')]);
    expect(await errorOf(write)).toBe('This app can only read.');

    // `plain` PKCE: refused before you ever see the consent page.
    const c = await newClient();
    const plain = await authorize(p, c, { challenge: 'a'.repeat(43), method: 'plain' });
    expect(plain.origin + plain.pathname).toBe(c.redirect);
    expect(plain.searchParams.get('error')).toBe('invalid_request');
  });

  it('MCP-A04 a token for another resource is refused; refresh rotates; revoke ends both', async () => {
    const p = await person();
    const c = await newClient();
    const other = await authorize(p, c, {
      challenge: pkce().challenge,
      resource: 'https://elsewhere.example/mcp',
    });
    expect(other.pathname).not.toBe('/oauth/consent');
    expect(other.searchParams.get('error')).toBeTruthy();

    const { client, tokens } = await connect(p, { level: 'write' }, c);
    // A token whose audience is somewhere else is not Tudu's to honour, even if one turns up.
    const [row] = await server.db
      .select()
      .from(schema.oauthAccessToken)
      .where(eq(schema.oauthAccessToken.clientId, client.clientId));
    await server.db
      .update(schema.oauthAccessToken)
      .set({ resources: ['https://elsewhere.example/mcp'] })
      .where(eq(schema.oauthAccessToken.id, row!.id));
    expect((await getAs('/api/me', tokens.access_token)).status).toBe(401);

    const refresh = (rt: string, clientId = client.clientId) =>
      tokenCall({
        grant_type: 'refresh_token',
        refresh_token: rt,
        client_id: clientId,
        resource: MCP_URL,
      });
    const res = await refresh(tokens.refresh_token!);
    expect(res.status, await res.clone().text()).toBe(200);
    const next = (await res.json()) as Tokens;
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect((await getAs('/api/me', next.access_token)).status).toBe(200);
    // Revoking the refresh token ends it.
    const revoke = await server.app.request('/api/auth/oauth2/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: next.refresh_token!, client_id: client.clientId }).toString(),
    });
    expect(revoke.status, await revoke.clone().text()).toBe(200);
    expect((await refresh(next.refresh_token!)).status).toBe(400);

    // Within 30 s a client racing itself gets the same answer again; past that, the old refresh token is spent, and
    // using it again ends the tokens that followed it too (a stolen token was replayed).
    // A second app: the first one is already allowed, so it would skip the consent page.
    const second = await connect(p, { level: 'write' });
    const again = await refresh(second.tokens.refresh_token!, second.client.clientId);
    expect(again.status, await again.clone().text()).toBe(200);
    const after = (await again.json()) as Tokens;
    await server.db
      .update(schema.oauthRefreshToken)
      .set({ rotationReplayExpiresAt: new Date(Date.now() - 1000) })
      .where(sql`${schema.oauthRefreshToken.rotatedAt} is not null`);
    expect((await refresh(second.tokens.refresh_token!, second.client.clientId)).status).toBe(400);
    expect((await refresh(after.refresh_token!, second.client.clientId)).status).toBe(400);
  });

  it('MCP-A05 open registration makes an unverified app; the 11th in an hour from one address is 429', async () => {
    const p = await person();
    const c = await newClient({ client_name: 'Claude', redirect_uris: ['https://evil.example/cb'] });
    const consent = await authorize(p, c, { challenge: pkce().challenge });
    const ask = await get(server.app, `/api/oauth/request${consent.search}`, p.jar);
    expect(ask.status).toBe(200);
    const body = (await ask.json()) as {
      app: { name: string; verified: boolean; icon: string | null; host: string };
    };
    // Calling itself Claude doesn't make it Claude: the code would go to evil.example.
    expect(body.app).toMatchObject({ name: 'Claude', verified: false, icon: null, host: 'evil.example' });

    const from = '10.9.9.9';
    for (let i = 0; i < 10; i++) expect((await register({}, from)).status).toBeLessThan(300);
    const eleventh = await register({}, from);
    expect(eleventh.status).toBe(429);
    expect(eleventh.headers.get('retry-after')).toBeTruthy();
  });

  it('MCP-A06 a client metadata URL registers the app from its document; a changed redirect is refused', async () => {
    documents.set(
      CIMD_URL,
      json({
        client_id: CIMD_URL,
        client_name: 'Example AI',
        logo_uri: 'https://app.example/logo.png',
        redirect_uris: [CIMD_REDIRECT],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    );
    const p = await person();
    const consent = await authorize(
      p,
      { clientId: CIMD_URL, redirect: CIMD_REDIRECT },
      { challenge: pkce().challenge },
    );
    expect(consent.pathname).toBe('/oauth/consent');
    const [client] = await server.db
      .select()
      .from(schema.oauthClient)
      .where(eq(schema.oauthClient.clientId, CIMD_URL));
    expect(client).toMatchObject({ name: 'Example AI', icon: 'https://app.example/logo.png' });

    const changed = await authorize(
      p,
      { clientId: CIMD_URL, redirect: 'https://attacker.example/cb' },
      { challenge: pkce().challenge },
    );
    expect(changed.pathname).not.toBe('/oauth/consent');
    expect(changed.host).not.toBe('attacker.example');
  });

  it('MCP-U07 client metadata documents: http, a mismatched client_id and an oversized document are refused', async () => {
    const p = await person();
    const refused = async (clientId: string) => {
      const res = await get(
        server.app,
        `/api/auth/oauth2/authorize?${new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: CIMD_REDIRECT,
          code_challenge: pkce().challenge,
          code_challenge_method: 'S256',
          resource: MCP_URL,
        })}`,
        p.jar,
      );
      const loc = res.headers.get('location') ?? '';
      expect(
        res.status === 400 || res.status === 401 || /error=/.test(loc),
        `${clientId}: ${res.status} ${loc}`,
      ).toBe(true);
      expect(loc).not.toContain('/oauth/consent');
    };
    await refused('http://app.example/oauth/client.json');

    const mismatch = 'https://app.example/oauth/mismatch.json';
    documents.set(mismatch, json({ client_id: CIMD_URL, client_name: 'X', redirect_uris: [CIMD_REDIRECT] }));
    await refused(mismatch);

    const big = 'https://app.example/oauth/big.json';
    documents.set(
      big,
      json({ client_id: big, client_name: 'x'.repeat(10_000), redirect_uris: [CIMD_REDIRECT] }),
    );
    await refused(big);
  });

  it('Cancel on the consent page sends the app back with access_denied and keeps nothing', async () => {
    const p = await person();
    const c = await newClient();
    const consent = await authorize(p, c, { challenge: pkce().challenge });
    const res = await post(server.app, '/api/oauth/deny', { query: consent.search.slice(1) }, p.jar);
    expect(res.status).toBe(200);
    const back = new URL(((await res.json()) as { url: string }).url);
    expect(back.searchParams.get('error')).toBe('access_denied');
    const grants = await server.db
      .select()
      .from(schema.oauthGrants)
      .where(eq(schema.oauthGrants.userId, p.userId));
    expect(grants).toHaveLength(0);

    const tampered = new URLSearchParams(consent.search);
    tampered.set('scope', 'offline_access profile');
    const bad = await get(server.app, `/api/oauth/request?${tampered}`, p.jar);
    expect(bad.status).toBe(400);
    expect(await errorOf(bad)).toBe('This link didn’t work. Go back to the app and connect again.');
  });

  it('MCP-A07 disconnecting an app ends its tokens, removes its consent, and drops it from the list', async () => {
    const p = await person();
    const { client, tokens } = await connect(p, { level: 'write' });
    const listed = (await (await get(server.app, '/api/apps', p.jar)).json()) as {
      apps: Array<{ clientId: string; name: string; verified: boolean; level: string }>;
    };
    expect(listed.apps).toEqual([
      expect.objectContaining({ clientId: client.clientId, name: 'Claude', verified: true }),
    ]);

    expect((await del(`/api/apps/${encodeURIComponent(client.clientId)}`, p.jar)).status).toBe(204);
    expect((await getAs('/api/me', tokens.access_token)).status).toBe(401);
    const consents = await server.db
      .select()
      .from(schema.oauthConsent)
      .where(
        and(eq(schema.oauthConsent.userId, p.userId), eq(schema.oauthConsent.clientId, client.clientId)),
      );
    expect(consents).toHaveLength(0);
    const after = (await (await get(server.app, '/api/apps', p.jar)).json()) as { apps: unknown[] };
    expect(after.apps).toHaveLength(0);
    const refreshed = await tokenCall({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token!,
      client_id: client.clientId,
      resource: MCP_URL,
    });
    expect(refreshed.status).toBe(400);
  });
});

describe('AI access: what it leaves behind', () => {
  it('MCP-A08 a change through a key reaches your other Tudus, history says via, each call is logged and trimmed at 90 days', async () => {
    const p = await person();
    const { key, row } = await makeKey(p, { name: 'Claude Code', level: 'write' });
    const heard = new Promise<{ spaceId: string }>((resolve) => {
      const off = server.hub.subscribe(p.userId, (e) => {
        if (e.type !== 'tasks.changed') return;
        off();
        resolve(e.data as { spaceId: string });
      });
    });
    const id = randomUUID();
    expect((await syncAs(key, [createTask(p.personalId, 'Through the key', id)])).status).toBe(200);
    expect((await heard).spaceId).toBe(p.personalId);

    const events = await server.db.select().from(schema.taskEvents).where(eq(schema.taskEvents.taskId, id));
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.via === 'key:Claude Code')).toBe(true);
    // Made in Tudu: no via.
    const mine = randomUUID();
    await syncJar(p, [createTask(p.personalId, 'By hand', mine)]);
    const own = await server.db.select().from(schema.taskEvents).where(eq(schema.taskEvents.taskId, mine));
    expect(own.every((e) => e.via === null)).toBe(true);

    await getAs('/api/me', key);
    await getAs('/api/keys', key);
    const log = await server.db.select().from(schema.accessLog).where(eq(schema.accessLog.grantId, row.id));
    expect(log.map((l) => [l.method, l.path, l.status])).toEqual([
      ['POST', '/api/sync', 200],
      ['GET', '/api/me', 200],
      ['GET', '/api/keys', 403],
    ]);
    expect(await sweepAccessLog(server.db, new Date(Date.now() + 89 * 86_400_000))).toBe(0);
    expect(await sweepAccessLog(server.db, new Date(Date.now() + 91 * 86_400_000))).toBeGreaterThanOrEqual(3);
  });

  it('MCP-A09 the 121st call in a minute is 429 with Retry-After', async () => {
    const p = await person();
    const { key } = await makeKey(p, { level: 'read' });
    for (let i = 0; i < 120; i++) expect((await getAs('/api/access', key)).status).toBe(200);
    const res = await getAs('/api/access', key);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    // Your own sign-in is never counted.
    expect((await get(server.app, '/api/me', p.jar)).status).toBe(200);
  });
});
