import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/client';
import type { SpaceSummary } from '@tudu/core';
import { get, post, signIn, startServer, type Jar } from '../../server/test/harness';
import { connectClient, startMcp, textOf } from './mcp';

/** The MCP server against the real API, in this process, on the run's database. */
let server: ReturnType<typeof startServer>;
let mcpUrl: string;
beforeAll(async () => {
  server = startServer();
  const app = server.app;
  // The MCP server's calls to http://api.test go straight to the API app.
  const fetchApi = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    return Promise.resolve(app.request(url.pathname + url.search, init));
  }) as typeof fetch;
  ({ url: mcpUrl } = await startMcp({ fetch: fetchApi }));
});
afterAll(async () => {
  await server.close();
});

interface Person {
  jar: Jar;
  personalId: string;
}
async function person(): Promise<Person> {
  const { jar } = await signIn(server);
  const me = (await (await get(server.app, '/api/me', jar)).json()) as { spaces: SpaceSummary[] };
  return { jar, personalId: me.spaces[0]!.id };
}
async function key(p: Person, body: Record<string, unknown>): Promise<{ key: string; id: string }> {
  const res = await post(
    server.app,
    '/api/keys',
    { name: `Key ${randomUUID().slice(0, 6)}`, ...body },
    p.jar,
  );
  expect(res.status).toBe(201);
  const out = (await res.json()) as { key: string; row: { id: string } };
  return { key: out.key, id: out.row.id };
}
const call = (c: Client, name: string, args: Record<string, unknown> = {}) =>
  c.callTool({ name, arguments: args });
const today = new Date().toISOString().slice(0, 10);

describe('MCP end to end', () => {
  it('MCP-M01 no bearer is 401 with resource_metadata, which names the API as the authorization server', async () => {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
    const challenge = res.headers.get('www-authenticate') ?? '';
    const m = /resource_metadata="([^"]+)"/.exec(challenge);
    expect(m, challenge).toBeTruthy();
    const meta = (await (await fetch(m![1]!)).json()) as {
      resource: string;
      authorization_servers: string[];
    };
    expect(meta.resource).toBe(mcpUrl);
    expect(meta.authorization_servers).toEqual(['http://localhost:3456/api/auth']);

    const health = await fetch(new URL('/health', mcpUrl));
    expect(await health.json()).toMatchObject({ ok: true });
  });

  it('MCP-M02 a read key lists the tools, reads a day, searches and opens a task; adding is refused', async () => {
    const p = await person();
    const made = await post(
      server.app,
      '/api/sync',
      {
        clientId: 'tab-1',
        mutations: [
          {
            id: randomUUID(),
            type: 'task.create',
            at: new Date().toISOString(),
            payload: {
              id: randomUUID(),
              spaceId: p.personalId,
              title: 'Plan the launch',
              day: today,
              position: null,
            },
          },
        ],
      },
      p.jar,
    );
    const ref = ((await made.json()) as { tasks: Array<{ ref: string }> }).tasks[0]!.ref;
    const c = await connectClient(mcpUrl, (await key(p, { level: 'read' })).key);

    const { tools } = await c.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(19);
    expect(textOf(await call(c, 'get_day', { spaceId: p.personalId, day: today }))).toContain(
      'Plan the launch',
    );
    expect(textOf(await call(c, 'search_tasks', { query: 'launch' }))).toContain(ref);
    expect(textOf(await call(c, 'get_task', { task: ref }))).toContain('Plan the launch');
    const no = await call(c, 'create_task', { spaceId: p.personalId, title: 'Nope' });
    expect(no.isError).toBe(true);
    expect(textOf(no)).toBe('This key can only read.');
  });

  it('MCP-M03 a write key adds, ticks and reads back; delete needs the switch, then the task goes to Trash', async () => {
    const p = await person();
    const c = await connectClient(mcpUrl, (await key(p, { level: 'write' })).key);
    const added = await call(c, 'create_task', { spaceId: p.personalId, title: 'Ship it', day: today });
    expect(added.isError, textOf(added)).toBeFalsy();
    const ref = (added.structuredContent as { task: { ref: string } }).task.ref;
    expect((await call(c, 'complete_task', { task: ref })).isError).toBeFalsy();
    expect(textOf(await call(c, 'get_day', { spaceId: p.personalId, day: today }))).toContain(
      `[x] ${ref} Ship it`,
    );

    const no = await call(c, 'delete_task', { task: ref });
    expect(textOf(no)).toBe('This key can’t delete.');
    const d = await connectClient(mcpUrl, (await key(p, { level: 'write', canDelete: true })).key);
    expect((await call(d, 'delete_task', { task: ref })).isError).toBeFalsy();
    expect(textOf(await call(d, 'get_day', { spaceId: p.personalId, day: today }))).not.toContain(ref);
  });

  it('MCP-M04 a key for one space lists only it; a task elsewhere is not found', async () => {
    const p = await person();
    const res = await post(
      server.app,
      '/api/spaces',
      { name: 'Harbour', color: '#3d5a80', invites: [] },
      p.jar,
    );
    const team = ((await res.json()) as { space: SpaceSummary }).space;
    const full = await connectClient(mcpUrl, (await key(p, { level: 'write' })).key);
    const added = await call(full, 'create_task', { spaceId: team.id, title: 'Team only' });
    const ref = (added.structuredContent as { task: { ref: string } }).task.ref;

    const c = await connectClient(mcpUrl, (await key(p, { level: 'read', spaces: [p.personalId] })).key);
    const spaces = textOf(await call(c, 'list_spaces'));
    expect(spaces).toContain(p.personalId);
    expect(spaces).not.toContain(team.id);
    expect(textOf(await call(c, 'get_task', { task: ref }))).toBe('No task with that ID.');
  });

  it('MCP-M05 revoking a key in Settings stops the next call at once', async () => {
    const p = await person();
    const k = await key(p, { level: 'read' });
    const c = await connectClient(mcpUrl, k.key);
    expect((await call(c, 'whoami')).isError).toBeFalsy();
    const del = await server.app.request(`/api/keys/${k.id}`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost:5173', cookie: p.jar.header() },
    });
    expect(del.status).toBe(204);
    // The door's 30 s check may still pass, but Tudu itself refuses the key from now on.
    const after = await call(c, 'list_spaces').catch((e: unknown) => ({
      isError: true,
      content: [{ type: 'text', text: String(e) }],
    }));
    expect(after.isError).toBe(true);
    expect(textOf(after)).toMatch(/isn’t valid|revoked|401/);
  });
});
