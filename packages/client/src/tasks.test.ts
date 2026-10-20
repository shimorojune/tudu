import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { DayResponse, Project, SyncResponse, Task, TaskDetail } from '@tudu/core';
import { createApi } from './api';
import { MemoryOutboxStore } from './outbox';
import { TaskStore, applyToDay, dayKey, projectsKey, taskKey, type DayData } from './tasks';

const SPACE = 'space-1';
const SUN = '2026-10-18';
const MON = '2026-10-19';

function task(id: string, title: string, day: string, position: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    spaceId: SPACE,
    number: Number(id.replace(/\D/g, '')) || 1,
    ref: `ME-${Number(id.replace(/\D/g, '')) || 1}`,
    title,
    day,
    position,
    done: false,
    doneAt: null,
    carriedFrom: null,
    due: null,
    visibility: 'space',
    projectId: null,
    subtasks: [],
    subsDone: 0,
    subsTotal: 0,
    commentCount: 0,
    createdAt: '2026-10-18T08:00:00.000Z',
    updatedAt: '2026-10-18T08:00:00.000Z',
    ...extra,
  };
}

function detailOf(t: Task): TaskDetail {
  return { ...t, notes: '', comments: [], history: [{ id: 1, at: t.createdAt, kind: 'created' }] };
}

/** A pretend server: days held in memory, sync answered by a function the test sets. */
function setup(days: Record<string, Task[]>, projects: Project[] = []) {
  const calls: string[] = [];
  let answer: (body: {
    mutations: Array<{ id: string; type: string; payload: { id: string } }>;
  }) => SyncResponse = (body) => ({
    results: body.mutations.map((m) => ({ id: m.id, status: 'ok' })),
    tasks: [],
    deleted: [],
  });
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    calls.push(`${init?.method ?? 'GET'} ${u.pathname}`);
    if (u.pathname === '/api/sync') {
      return new Response(JSON.stringify(answer(JSON.parse(String(init!.body)))), { status: 200 });
    }
    if (u.pathname.endsWith('/projects')) {
      return new Response(JSON.stringify({ projects }), { status: 200 });
    }
    if (u.pathname.endsWith('/files')) {
      const body = init!.body as FormData;
      const file = body.get('file') as File;
      if (file.size > 25 * 1024 * 1024)
        return new Response('{"error":"That file is too big. Files can be up to 25 MB."}', { status: 413 });
      return new Response(
        JSON.stringify({
          id: `att-${file.name}`,
          spaceId: SPACE,
          taskId: body.get('taskId'),
          name: file.name,
          size: file.size,
          type: file.type,
          createdAt: '',
        }),
        { status: 201 },
      );
    }
    const m = /\/tasks\/([^/]+)$/.exec(u.pathname);
    if (m) {
      const hit = Object.values(days)
        .flat()
        .find((t) => t.id === m[1]);
      return hit
        ? new Response(JSON.stringify(detailOf(hit)), { status: 200 })
        : new Response('{"error":"gone"}', { status: 404 });
    }
    const day = u.pathname.split('/').pop()!;
    const body: DayResponse = { day, tasks: days[day] ?? [], counts: { total: 0, done: 0 } };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const rejected: string[] = [];
  let n = 0;
  const store = new TaskStore({
    api: createApi({ baseUrl: 'http://api.test', fetch: fetch as unknown as typeof globalThis.fetch }),
    queryClient,
    store: new MemoryOutboxStore(),
    clientId: 'tab-a',
    me: () => ({ id: 'me', name: 'Rohit Raj', email: 'rohit@test.tudu' }),
    onRejected: (msg) => rejected.push(msg),
    newId: () => `new-${++n}`,
  });
  const read = (day: string) => queryClient.getQueryData<DayData>(dayKey(SPACE, day))?.tasks ?? [];
  const readTask = (id: string) => queryClient.getQueryData<TaskDetail>(taskKey(SPACE, id));
  const readProjects = () => queryClient.getQueryData<Project[]>(projectsKey(SPACE)) ?? [];
  const loadProjects = async () => {
    const data = await queryClient.fetchQuery(store.projectsQuery(SPACE));
    new QueryObserver(queryClient, store.projectsQuery(SPACE)).subscribe(() => {});
    return data;
  };
  const loadTask = async (id: string) => {
    const data = await queryClient.fetchQuery(store.taskQuery(SPACE, id));
    new QueryObserver(queryClient, store.taskQuery(SPACE, id)).subscribe(() => {});
    return data;
  };
  // A day on screen: an observer keeps the query active, so invalidating it reads it again.
  const load = async (day: string) => {
    const data = await queryClient.fetchQuery(store.dayQuery(SPACE, day, SUN));
    new QueryObserver(queryClient, store.dayQuery(SPACE, day, SUN)).subscribe(() => {});
    return data;
  };
  const settle = async () => {
    for (let i = 0; i < 50 && !(await store.idle()); i++) await new Promise((r) => setTimeout(r, 5));
    await new Promise((r) => setTimeout(r, 0));
  };
  return {
    store,
    queryClient,
    calls,
    rejected,
    read,
    load,
    readTask,
    loadTask,
    readProjects,
    loadProjects,
    settle,
    answer: (fn: typeof answer) => (answer = fn),
  };
}

describe('C02-U19 changes apply at once and queue in the outbox', () => {
  it('C02-U19 a new task shows at once, queues, and takes its number when the save lands', async () => {
    const t = setup({ [SUN]: [task('t1', 'Pay the electricity bill', SUN, 1024)] });
    await t.load(SUN);
    t.answer((body) => ({
      results: body.mutations.map((m) => ({ id: m.id, status: 'ok' })),
      tasks: [task('new-1', 'Call Sam at 3pm', SUN, 2048, { number: 2, ref: 'ME-2' })],
      deleted: [],
    }));
    const id = t.store.create(SPACE, SUN, '  Call Sam at 3pm ');
    // on screen before anything reached the server, without its number yet
    expect(t.read(SUN).map((x) => [x.title, x.ref])).toEqual([
      ['Pay the electricity bill', 'ME-1'],
      ['Call Sam at 3pm', null],
    ]);
    expect(t.read(SUN)[1]!.position).toBe(2048);
    await t.settle();
    expect(t.calls).toContain('POST /api/sync');
    expect(t.read(SUN).find((x) => x.id === id)!.ref).toBe('ME-2');
  });

  it('C02-U19 crossing off, renaming, reordering and moving all show at once', async () => {
    const t = setup({
      [SUN]: [task('t1', 'One', SUN, 1024), task('t2', 'Two', SUN, 2048), task('t3', 'Three', SUN, 3072)],
      [MON]: [task('t4', 'Four', MON, 1024)],
    });
    await t.load(SUN);
    await t.load(MON);
    t.store.cross('t1', true);
    t.store.rename('t2', 'Two, renamed');
    t.store.place('t3', SUN, 0);
    expect(t.read(SUN).map((x) => [x.title, x.done])).toEqual([
      ['Three', false],
      ['One', true],
      ['Two, renamed', false],
    ]);
    t.store.place('t1', MON, 0);
    expect(t.read(SUN).map((x) => x.title)).toEqual(['Three', 'Two, renamed']);
    expect(t.read(MON).map((x) => x.title)).toEqual(['One', 'Four']);
    await t.settle();
    expect(await t.store.idle()).toBe(true);
  });

  it('C02-U19 a change the server refuses is rolled back and the person is told why', async () => {
    const t = setup({ [SUN]: [task('t1', 'Not mine any more', SUN, 1024)] });
    await t.load(SUN);
    t.answer((body) => ({
      results: body.mutations.map((m) => ({
        id: m.id,
        status: 'rejected',
        code: 410,
        error: 'That task was deleted.',
      })),
      tasks: [],
      deleted: [],
    }));
    t.store.cross('t1', true);
    expect(t.read(SUN)[0]!.done).toBe(true);
    await t.settle();
    await vi.waitFor(() => expect(t.read(SUN)[0]!.done).toBe(false));
    expect(t.rejected).toEqual(['That task was deleted.']);
  });

  it('C02-U19 a slow save never flickers: a refetch keeps the changes still on their way', async () => {
    const t = setup({ [SUN]: [task('t1', 'Old words', SUN, 1024)] });
    await t.load(SUN);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = t.store.outbox;
    const flush = slow.flush.bind(slow);
    // hold the outbox back while the day is read again
    slow.flush = async () => {
      await gate;
      return flush();
    };
    t.store.rename('t1', 'New words');
    await t.queryClient.refetchQueries({ queryKey: dayKey(SPACE, SUN) });
    expect(t.read(SUN)[0]!.title).toBe('New words');
    release();
    await t.settle();
  });
});

describe('C02-U20 live events refresh the days they name', () => {
  it('C02-U20 an event for a day refreshes it; other days and our own events do not refetch', async () => {
    const t = setup({ [SUN]: [task('t1', 'One', SUN, 1024)], [MON]: [] });
    await t.load(SUN);
    await t.load(MON);
    t.calls.length = 0;
    t.store.onEvent({
      id: '1',
      type: 'tasks.changed',
      data: { spaceId: SPACE, days: [MON], clientId: 'tab-b' },
    });
    await vi.waitFor(() => expect(t.calls).toEqual([`GET /api/spaces/${SPACE}/days/${MON}`]));
    t.calls.length = 0;
    t.store.onEvent({
      id: '2',
      type: 'tasks.changed',
      data: { spaceId: SPACE, days: [SUN], clientId: 'tab-a' },
    });
    t.store.onEvent({ id: '3', type: 'something.else', data: {} });
    await new Promise((r) => setTimeout(r, 20));
    expect(t.calls).toEqual([]);
  });
});

describe('applying a change to a day', () => {
  it('is safe to apply twice and leaves other days alone', () => {
    const list = [task('t1', 'One', SUN, 1024)];
    const create = {
      id: 'm1',
      at: '2026-10-18T09:00:00.000Z',
      type: 'task.create' as const,
      payload: { id: 't9', spaceId: SPACE, title: 'Nine', day: SUN, position: 2048 },
    };
    const once = applyToDay(list, SUN, SPACE, create, () => undefined);
    expect(applyToDay(once, SUN, SPACE, create, () => undefined)).toHaveLength(2);
    expect(applyToDay(list, MON, SPACE, create, () => undefined)).toBe(list);
  });
});

describe('C03-U21 detail changes apply at once and queue', () => {
  it('C03-U21 due, notes, visibility, subtasks and comments show in the task and on its row before the save lands', async () => {
    const t = setup({ [SUN]: [task('t1', 'One', SUN, 1024), task('t2', 'Two', SUN, 2048)] });
    await t.load(SUN);
    await t.loadTask('t1');
    t.store.due('t1', '2026-10-23');
    t.store.notes('t1', '<p>Staging first.</p>');
    t.store.visibility('t1', 'me');
    const s1 = t.store.addSubtask(SPACE, 't1', ' Pull the branch ');
    const s2 = t.store.addSubtask(SPACE, 't1', 'Run it');
    t.store.crossSubtask('t1', s1, true);
    t.store.renameSubtask('t1', s2, 'Run it on a clean profile');
    const c1 = t.store.addComment('t1', '<p>Will review tomorrow.</p>');
    const d = t.readTask('t1')!;
    expect(d.due).toBe('2026-10-23');
    expect(d.notes).toBe('<p>Staging first.</p>');
    expect(d.visibility).toBe('me');
    expect(d.subtasks.map((s) => [s.title, s.done])).toEqual([
      ['Pull the branch', true],
      ['Run it on a clean profile', false],
    ]);
    expect(d.subtasks[1]!.position).toBeGreaterThan(d.subtasks[0]!.position);
    expect(d.comments.map((c) => [c.id, c.author.name, c.html])).toEqual([
      [c1, 'Rohit Raj', '<p>Will review tomorrow.</p>'],
    ]);
    expect([d.subsDone, d.subsTotal, d.commentCount]).toEqual([1, 2, 1]);
    const row = t.read(SUN)[0]!;
    expect([row.due, row.subsDone, row.subsTotal, row.commentCount]).toEqual(['2026-10-23', 1, 2, 1]);
    expect(row.subtasks.map((s) => s.title)).toEqual(['Pull the branch', 'Run it on a clean profile']);
    // reorder, edit and delete
    t.store.placeSubtask(SPACE, 't1', s2, 0);
    t.store.editComment('t1', c1, '<p>Reviewed.</p>');
    expect(t.readTask('t1')!.subtasks.map((s) => s.title)).toEqual([
      'Run it on a clean profile',
      'Pull the branch',
    ]);
    expect(t.readTask('t1')!.comments[0]).toMatchObject({ html: '<p>Reviewed.</p>' });
    expect(t.readTask('t1')!.comments[0]!.editedAt).not.toBeNull();
    t.store.removeSubtask('t1', s1);
    t.store.removeComment('t1', c1);
    expect([t.readTask('t1')!.subsTotal, t.readTask('t1')!.commentCount]).toEqual([1, 0]);
    expect(t.read(SUN)[0]!.subsTotal).toBe(1);
    await t.settle();
    expect(await t.store.idle()).toBe(true);
    const sent = t.calls.filter((c) => c === 'POST /api/sync');
    expect(sent.length).toBeGreaterThan(0);
  });

  it('C03-U21 a refused change rolls the task back and the person is told why', async () => {
    const t = setup({ [SUN]: [task('t1', 'One', SUN, 1024)] });
    await t.load(SUN);
    await t.loadTask('t1');
    t.answer((body) => ({
      results: body.mutations.map((m) => ({
        id: m.id,
        status: m.type === 'task.due' ? 'rejected' : 'ok',
        code: 403,
        error: 'You can’t change tasks in that space.',
      })),
      tasks: [],
      deleted: [],
    }));
    t.store.due('t1', '2026-10-23');
    expect(t.readTask('t1')!.due).toBe('2026-10-23');
    await t.settle();
    await vi.waitFor(() => expect(t.readTask('t1')!.due).toBeNull());
    expect(t.read(SUN)[0]!.due).toBeNull();
    expect(t.rejected).toEqual(['You can’t change tasks in that space.']);
  });
});

describe('C03-U22 delete, restore and live events for a task', () => {
  it('C03-U22 delete takes the row off its day; restore puts it back in its place', async () => {
    const t = setup({
      [SUN]: [task('t1', 'One', SUN, 1024), task('t2', 'Two', SUN, 2048), task('t3', 'Three', SUN, 3072)],
    });
    await t.load(SUN);
    t.store.remove('t2');
    expect(t.read(SUN).map((x) => x.title)).toEqual(['One', 'Three']);
    t.store.restore('t2');
    expect(t.read(SUN).map((x) => x.title)).toEqual(['One', 'Two', 'Three']);
    await t.settle();
    expect(await t.store.idle()).toBe(true);
  });

  it('C03-U22 a live event naming a task reads that task again, and nothing else', async () => {
    const t = setup({ [SUN]: [task('t1', 'One', SUN, 1024), task('t2', 'Two', SUN, 2048)] });
    await t.load(SUN);
    await t.loadTask('t1');
    await t.loadTask('t2');
    t.calls.length = 0;
    t.store.onEvent({
      id: '1',
      type: 'tasks.changed',
      data: { spaceId: SPACE, days: [], tasks: ['t2'], clientId: 'tab-b' },
    });
    await vi.waitFor(() => expect(t.calls).toEqual([`GET /api/spaces/${SPACE}/tasks/t2`]));
    t.calls.length = 0;
    t.store.onEvent({
      id: '2',
      type: 'tasks.changed',
      data: { spaceId: SPACE, days: [SUN], tasks: ['t1'], clientId: 'tab-a' },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(t.calls).toEqual([]);
  });
});

describe('C04-U14 projects and a task from Quick Add', () => {
  it('C04-U14 a new project shows at once with the next colour; set project shows on the row and in the panel', async () => {
    const t = setup({ [SUN]: [task('t1', 'One', SUN, 1024)] }, [
      {
        id: 'p1',
        spaceId: SPACE,
        name: 'Northwind',
        color: '#3d5a80',
        position: 1024,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    await t.load(SUN);
    await t.loadTask('t1');
    await t.loadProjects();
    const p2 = t.store.createProject(SPACE, ' Platform ');
    expect(t.readProjects().map((p) => [p.name, p.color])).toEqual([
      ['Northwind', '#3d5a80'],
      ['Platform', '#5b7553'],
    ]);
    t.store.setProject('t1', p2);
    expect(t.read(SUN)[0]!.projectId).toBe(p2);
    expect(t.readTask('t1')!.projectId).toBe(p2);
    t.store.updateProject(SPACE, p2, { name: 'Platform team' });
    expect(t.readProjects()[1]!.name).toBe('Platform team');
    t.store.deleteProject(SPACE, p2);
    expect(t.readProjects().map((p) => p.id)).toEqual(['p1']);
    expect(t.read(SUN)[0]!.projectId).toBeNull();
    expect(t.readTask('t1')!.projectId).toBeNull();
    await t.settle();
    expect(await t.store.idle()).toBe(true);
  });

  it('C04-U14 a task from Quick Add lands with its due day, project, notes and files, and queues as one change', async () => {
    const t = setup({ [SUN]: [] });
    await t.load(SUN);
    const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
    t.answer((body) => {
      sent.push(...(body.mutations as never[]));
      return { results: body.mutations.map((m) => ({ id: m.id, status: 'ok' })), tasks: [], deleted: [] };
    });
    const id = t.store.create(SPACE, SUN, 'Send the offsite agenda', undefined, {
      due: '2026-10-22',
      projectId: null,
      notes: '<p>Keep it to one page.</p>',
      attachments: ['att-1'],
      source: 'quick-add',
    });
    const row = t.read(SUN)[0]!;
    expect([row.id, row.title, row.due, row.projectId]).toEqual([
      id,
      'Send the offsite agenda',
      '2026-10-22',
      null,
    ]);
    await t.settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.type).toBe('task.create');
    expect(sent[0]!.payload).toMatchObject({
      due: '2026-10-22',
      notes: '<p>Keep it to one page.</p>',
      attachments: ['att-1'],
      source: 'quick-add',
    });
  });

  it('C04-U14 a live event for projects reads them again', async () => {
    const t = setup({ [SUN]: [] });
    await t.loadProjects();
    t.calls.length = 0;
    t.store.onEvent({ id: '1', type: 'projects.changed', data: { spaceId: SPACE, clientId: 'tab-b' } });
    await vi.waitFor(() => expect(t.calls).toEqual([`GET /api/spaces/${SPACE}/projects`]));
  });
});

describe('C04-U15 uploads', () => {
  it('C04-U15 an upload answers with the attachment; a refused one throws with the server’s words', async () => {
    const t = setup({ [SUN]: [] });
    const small = new File([new Uint8Array(1200)], 'spec.pdf', { type: 'application/pdf' });
    const saved = await t.store.upload(SPACE, small, null);
    expect(saved).toMatchObject({ id: 'att-spec.pdf', name: 'spec.pdf', size: 1200, taskId: null });
    const big = new File([new Uint8Array(26 * 1024 * 1024)], 'big.bin');
    await expect(t.store.upload(SPACE, big, 't1')).rejects.toThrow(
      'That file is too big. Files can be up to 25 MB.',
    );
    expect(t.calls.filter((c) => c === `POST /api/spaces/${SPACE}/files`)).toHaveLength(2);
  });
});
