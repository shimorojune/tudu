import { beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/client';
import { connectClient, startMcp, textOf } from './mcp';

/** A stand-in for the Tudu API: canned answers by path, and every call it got. */
interface Call {
  method: string;
  path: string;
  bearer: string | null;
  body: { mutations?: Array<{ type: string; payload: Record<string, unknown> }> } | null;
}
const calls: Call[] = [];
const task = {
  id: 't1',
  spaceId: 's1',
  ref: 'ME-1',
  title: 'Write the plan',
  day: '2026-10-28',
  done: false,
  due: null,
  projectId: null,
  visibility: 'space',
  ownerId: null,
};
let refuseSync: string | null = null;
let staleOnce = false;

const api = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const body = init?.body ? (JSON.parse(String(init.body)) as Call['body']) : null;
  const bearer = new Headers(init?.headers).get('authorization');
  calls.push({ method: init?.method ?? 'GET', path: url.pathname + url.search, bearer, body });
  const p = url.pathname;
  if (p === '/api/access')
    return Response.json({
      user: { id: 'u1', name: 'Asha', email: 'asha@test.tudu' },
      access: {
        kind: 'key',
        id: 'k1',
        name: 'Test',
        level: 'write',
        canDelete: false,
        spaces: null,
        notebook: true,
      },
    });
  if (p === '/api/me')
    return Response.json({
      spaces: [
        { id: 's1', kind: 'personal', name: 'Personal', prefix: 'ME', role: 'owner', members: 1 },
        { id: 's2', kind: 'team', name: 'Northwind', prefix: 'NW', role: 'member', members: 4 },
      ],
    });
  if (p === '/api/spaces/s1/projects')
    return Response.json({
      projects: [
        { id: 'p1', name: 'Home', color: '#a35d3d' },
        { id: 'p2', name: 'Garden', color: '#5b7553' },
      ],
    });
  if (p === '/api/spaces/s2/projects') return Response.json({ projects: [] });
  if (p.startsWith('/api/spaces/s1/days/'))
    return Response.json({ tasks: [task], counts: { total: 1, done: 0 } });
  if (p === '/api/tasks/ref/ME-1') return Response.json({ spaceId: 's1', taskId: 't1' });
  if (p === '/api/spaces/s1/tasks/t1')
    return Response.json({ ...task, notes: '<p>Hi</p>', subtasks: [], comments: [], owner: null });
  if (p === '/api/notebook/notes/n1') return Response.json({ title: 'Log', html: '<p>one</p>', rev: 4 });
  if (p === '/api/sync') {
    if (refuseSync) return Response.json({ error: refuseSync }, { status: 403 });
    const ms = body?.mutations ?? [];
    if (staleOnce && ms[0]?.type === 'note.body') {
      staleOnce = false;
      return Response.json({
        results: [{ id: 'x', status: 'rejected', code: 409, error: 'Someone changed it.' }],
        tasks: [],
        deleted: [],
      });
    }
    return Response.json({ results: ms.map(() => ({ id: 'x', status: 'ok' })), tasks: [task], deleted: [] });
  }
  return Response.json({ error: 'Not found.' }, { status: 404 });
}) as typeof fetch;

let client: Client;
beforeAll(async () => {
  const { url } = await startMcp({ fetch: api });
  client = await connectClient(url, 'tudu_test');
});

const TOOLS: Record<string, 'read' | 'write' | 'delete'> = {
  whoami: 'read',
  list_spaces: 'read',
  get_day: 'read',
  get_week: 'read',
  get_backlog: 'read',
  search_tasks: 'read',
  get_task: 'read',
  list_inbox: 'read',
  list_notes: 'read',
  get_note: 'read',
  create_task: 'write',
  update_task: 'write',
  complete_task: 'write',
  move_task: 'write',
  add_subtask: 'write',
  add_comment: 'write',
  create_note: 'write',
  append_to_note: 'write',
  delete_task: 'delete',
};

describe('MCP tools', () => {
  it('MCP-U08 lists every tool with a title and the read-only, destructive and idempotent hints', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(TOOLS).sort());
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy();
      const a = t.annotations!;
      expect(typeof a.idempotentHint, t.name).toBe('boolean');
      expect(a.readOnlyHint, t.name).toBe(TOOLS[t.name] === 'read');
      expect(a.destructiveHint, t.name).toBe(TOOLS[t.name] === 'delete');
    }
  });

  it('MCP-U08 reads go to the right path with the caller’s bearer, and never roll days forward', async () => {
    calls.length = 0;
    const r = await client.callTool({ name: 'get_day', arguments: { spaceId: 's1', day: '2026-10-28' } });
    expect(r.isError).toBeFalsy();
    expect(textOf(r)).toContain('ME-1 Write the plan');
    expect(r.structuredContent).toMatchObject({ day: '2026-10-28', tasks: [{ ref: 'ME-1' }] });
    const day = calls.find((c) => c.path.startsWith('/api/spaces/s1/days/'))!;
    expect(day.path).toBe('/api/spaces/s1/days/2026-10-28');
    expect(day.bearer).toBe('Bearer tudu_test');
  });

  it('MCP-U08 writes are sync mutations; a refusal comes back as the API’s sentence', async () => {
    calls.length = 0;
    const r = await client.callTool({
      name: 'create_task',
      arguments: { spaceId: 's1', title: 'Call Sam', day: 'backlog' },
    });
    expect(r.isError).toBeFalsy();
    const sync = calls.find((c) => c.path === '/api/sync')!;
    expect(sync.method).toBe('POST');
    expect(sync.body!.mutations![0]).toMatchObject({
      type: 'task.create',
      payload: { spaceId: 's1', title: 'Call Sam', day: null },
    });

    refuseSync = 'This key can only read.';
    const no = await client.callTool({ name: 'complete_task', arguments: { task: 'ME-1' } });
    refuseSync = null;
    expect(no.isError).toBe(true);
    expect(textOf(no)).toBe('This key can only read.');
  });

  it('append_to_note adds to the end on the note’s current rev, and tries again after a clash', async () => {
    calls.length = 0;
    staleOnce = true;
    const r = await client.callTool({ name: 'append_to_note', arguments: { noteId: 'n1', text: 'two' } });
    expect(r.isError, textOf(r)).toBeFalsy();
    const bodies = calls.filter((c) => c.path === '/api/sync').map((c) => c.body!.mutations![0]!);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({
      type: 'note.body',
      payload: { id: 'n1', html: '<p>one</p><p>two</p>', baseRev: 4 },
    });
  });

  it('PH-U15 create_task takes a project by name; update_task sets one or "none"; an unknown name lists the space’s', async () => {
    calls.length = 0;
    const made = await client.callTool({
      name: 'create_task',
      arguments: { spaceId: 's1', title: 'Water the plants', project: 'garden' },
    });
    expect(made.isError, textOf(made)).toBeFalsy();
    expect(textOf(made)).toContain('in Garden');
    const create = calls.find((c) => c.path === '/api/sync')!.body!.mutations![0]!;
    expect(create).toMatchObject({ type: 'task.create', payload: { spaceId: 's1', projectId: 'p2' } });

    calls.length = 0;
    const set = await client.callTool({ name: 'update_task', arguments: { task: 'ME-1', project: 'HOME' } });
    expect(set.isError, textOf(set)).toBeFalsy();
    expect(calls.find((c) => c.path === '/api/sync')!.body!.mutations).toMatchObject([
      { type: 'task.project', payload: { id: 't1', projectId: 'p1' } },
    ]);

    calls.length = 0;
    await client.callTool({ name: 'update_task', arguments: { task: 'ME-1', project: 'none' } });
    expect(calls.find((c) => c.path === '/api/sync')!.body!.mutations).toMatchObject([
      { type: 'task.project', payload: { id: 't1', projectId: null } },
    ]);

    calls.length = 0;
    const no = await client.callTool({
      name: 'create_task',
      arguments: { spaceId: 's1', title: 'Fix the fence', project: 'Fence' },
    });
    expect(no.isError).toBe(true);
    expect(textOf(no)).toBe('No project called "Fence" in this space. Its projects: Home, Garden.');
    expect(calls.some((c) => c.path === '/api/sync')).toBe(false);
  });

  it('PH-U16 list_spaces lists each space’s projects', async () => {
    const r = await client.callTool({ name: 'list_spaces', arguments: {} });
    expect(r.isError, textOf(r)).toBeFalsy();
    expect(textOf(r)).toContain('Projects: Home, Garden');
    expect(textOf(r)).toContain('Projects: none');
    expect(r.structuredContent).toMatchObject({
      spaces: [
        {
          id: 's1',
          projects: [
            { id: 'p1', name: 'Home' },
            { id: 'p2', name: 'Garden' },
          ],
        },
        { id: 's2', projects: [] },
      ],
    });
  });
});
