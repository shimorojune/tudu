import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ALL_SPACES_CHANGED, POSITION_STEP, addDays } from '@tudu/core';
import type {
  AllSpacesPlace,
  DayResponse,
  Project,
  SyncMutation,
  SyncResponse,
  Task,
  TaskDetail,
  WeekResponse,
} from '@tudu/core';
import { createApi } from './api';
import { MemoryOutboxStore, type OutboxStore } from './outbox';
import {
  TaskStore,
  allPlacesKey,
  applyToDay,
  applyToProjects,
  dayKey,
  projectsKey,
  taskKey,
  type DayData,
} from './tasks';

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
    jira: null,
    ownerId: null,
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
  return {
    ...t,
    notes: '',
    comments: [],
    history: [{ id: 1, at: t.createdAt, kind: 'created' }],
    owner: null,
  };
}

/** A pretend server: days held in memory, sync answered by a function the test sets. */
function setup(days: Record<string, Task[]>, projects: Project[] = [], outbox?: OutboxStore) {
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
    if (u.pathname.endsWith('/backlog')) {
      return new Response(JSON.stringify({ tasks: days.backlog ?? [] }), { status: 200 });
    }
    const wk = /\/weeks\/([^/]+)$/.exec(u.pathname);
    if (wk) {
      const monday = wk[1]!;
      const body: WeekResponse = {
        monday,
        days: Array.from({ length: 7 }, (_, i) => {
          const d = addDays(monday, i);
          return { day: d, tasks: days[d] ?? [], counts: { total: 0, done: 0 } };
        }),
        backlog: days.backlog ?? [],
      };
      return new Response(JSON.stringify(body), { status: 200 });
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
    store: outbox ?? new MemoryOutboxStore(),
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
  const loadBacklog = async () => {
    const data = await queryClient.fetchQuery(store.backlogQuery(SPACE));
    new QueryObserver(queryClient, store.backlogQuery(SPACE)).subscribe(() => {});
    return data;
  };
  // The week page: the week read, then an observer on each of its eight lists, as the tiles are.
  const loadWeek = async (monday: string) => {
    const data = await queryClient.fetchQuery(store.weekQuery(SPACE, monday, SUN));
    new QueryObserver(queryClient, store.weekQuery(SPACE, monday, SUN)).subscribe(() => {});
    for (const d of data.days)
      new QueryObserver(queryClient, store.dayQuery(SPACE, d, SUN)).subscribe(() => {});
    new QueryObserver(queryClient, store.backlogQuery(SPACE)).subscribe(() => {});
    return data;
  };
  const readBacklog = () => queryClient.getQueryData<DayData>(dayKey(SPACE, null))?.tasks ?? [];
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
    readBacklog,
    loadBacklog,
    loadWeek,
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
  it('C03-U22 a change written while the outbox was sweeping the disk is still sent', async () => {
    // The sweep reads the disk; a write that lands during that read must not be mistaken for one already sent.
    const inner = new MemoryOutboxStore();
    let hold: Promise<void> | null = null;
    let reads = 0;
    let heldRead = -1;
    const gated: OutboxStore = {
      all: async () => {
        const snap = await inner.all();
        if (++reads === heldRead && hold) await hold;
        return snap;
      },
      put: (m) => inner.put(m),
      remove: (id) => inner.remove(id),
    };
    const t = setup({ [SUN]: [task('t1', 'One', SUN, 1024), task('t2', 'Two', SUN, 2048)] }, [], gated);
    await t.load(SUN);
    // A flush with nothing to send ends in a sweep; its read of the disk is held open.
    let release!: () => void;
    hold = new Promise((r) => (release = r));
    heldRead = reads + 2; // the flush's own read, then the sweep's
    await t.store.outbox.flush();
    await new Promise((r) => setTimeout(r, 0));
    t.store.remove('t2');
    await new Promise((r) => setTimeout(r, 0));
    release();
    await t.settle();
    expect(t.calls.filter((c) => c === 'POST /api/sync')).toHaveLength(1);
    expect(await t.store.idle()).toBe(true);
    expect(t.read(SUN).map((x) => x.title)).toEqual(['One']);
  });

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

describe('C18-U15 a new project goes first', () => {
  const create = (id: string, name: string) =>
    ({
      id: `m-${id}`,
      type: 'project.create',
      at: '2026-10-24T10:00:00.000Z',
      payload: { id, spaceId: SPACE, name, color: '#3d5a80' },
    }) as SyncMutation;
  const proj = (id: string, position: number): Project => ({
    id,
    spaceId: SPACE,
    name: id,
    color: '#3d5a80',
    position,
    createdAt: '2026-10-01T00:00:00.000Z',
  });

  it('C18-U15 into an empty space it gets POSITION_STEP; before 1024 and 2048 it gets 0 and sorts first', () => {
    expect(applyToProjects([], SPACE, create('a', 'Home')).map((p) => p.position)).toEqual([POSITION_STEP]);
    const after = applyToProjects([proj('p1', 1024), proj('p2', 2048)], SPACE, create('n', 'Garden'));
    expect(after.map((p) => [p.id, p.position])).toEqual([
      ['n', 0],
      ['p1', 1024],
      ['p2', 2048],
    ]);
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
    // New projects go first, before Northwind's 1024.
    expect(t.readProjects().map((p) => [p.name, p.color, p.position])).toEqual([
      ['Platform', '#5b7553', 0],
      ['Northwind', '#3d5a80', 1024],
    ]);
    t.store.setProject('t1', p2);
    expect(t.read(SUN)[0]!.projectId).toBe(p2);
    expect(t.readTask('t1')!.projectId).toBe(p2);
    t.store.updateProject(SPACE, p2, { name: 'Platform team' });
    expect(t.readProjects()[0]!.name).toBe('Platform team');
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

describe('C05-U10 the week in the store', () => {
  const MON = '2026-10-19';
  const TUE = '2026-10-20';
  const THU = '2026-10-22';
  const weekOf = () => ({
    [MON]: [task('m1', 'Mon one', MON, 1024), task('m2', 'Mon two', MON, 2048)],
    [THU]: [task('h1', 'Thu one', THU, 1024)],
    backlog: [task('b1', 'Waiting', null as unknown as string, 1024)],
  });

  it('C05-U10 one week read fills the seven day caches and the Backlog, and the tiles read nothing more', async () => {
    const t = setup(weekOf());
    const w = await t.loadWeek(MON);
    expect(w).toEqual({
      monday: MON,
      days: [MON, TUE, '2026-10-21', THU, '2026-10-23', '2026-10-24', '2026-10-25'],
    });
    expect(t.read(MON).map((x) => x.title)).toEqual(['Mon one', 'Mon two']);
    expect(t.read(TUE)).toEqual([]);
    expect(t.read(THU).map((x) => x.title)).toEqual(['Thu one']);
    expect(t.readBacklog().map((x) => x.title)).toEqual(['Waiting']);
    expect(t.store.cached(SPACE, null)?.length).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(t.calls).toEqual([`GET /api/spaces/${SPACE}/weeks/${MON}`]);
  });

  it('C05-U10 a move between tiles shows in both lists at once and queues one change; into and out of the Backlog too', async () => {
    const t = setup(weekOf());
    const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
    t.answer((body) => {
      sent.push(...(body.mutations as never[]));
      return { results: body.mutations.map((m) => ({ id: m.id, status: 'ok' })), tasks: [], deleted: [] };
    });
    await t.loadWeek(MON);
    t.store.place('m2', THU, 0);
    expect(t.read(MON).map((x) => x.title)).toEqual(['Mon one']);
    expect(t.read(THU).map((x) => x.title)).toEqual(['Mon two', 'Thu one']);
    t.store.place('b1', TUE, 0);
    expect(t.readBacklog()).toEqual([]);
    expect(t.read(TUE).map((x) => x.title)).toEqual(['Waiting']);
    t.store.place('m1', null);
    expect(t.read(MON)).toEqual([]);
    expect(t.readBacklog().map((x) => x.title)).toEqual(['Mon one']);
    await t.settle();
    expect(sent.map((m) => [m.type, m.payload.id, m.payload.day])).toEqual([
      ['task.place', 'm2', THU],
      ['task.place', 'b1', TUE],
      ['task.place', 'm1', null],
    ]);
    expect(sent[0]!.payload.position).toBeLessThan(1024);
  });

  it('C05-U10 a move the server refuses is undone in both lists and the person is told', async () => {
    const t = setup(weekOf());
    t.answer((body) => ({
      results: body.mutations.map((m) => ({ id: m.id, status: 'rejected', code: 403, error: 'Not yours.' })),
      tasks: [],
      deleted: [],
    }));
    await t.loadWeek(MON);
    t.store.place('m2', THU, 0);
    expect(t.read(THU).map((x) => x.title)).toEqual(['Mon two', 'Thu one']);
    await t.settle();
    await vi.waitFor(() => expect(t.read(THU).map((x) => x.title)).toEqual(['Thu one']));
    expect(t.read(MON).map((x) => x.title)).toEqual(['Mon one', 'Mon two']);
    expect(t.rejected).toEqual(['Not yours.']);
  });
});

describe('C05-U11 live events and the week', () => {
  const MON = '2026-10-19';
  it('C05-U11 an event for a day refreshes that tile only; one for the Backlog refreshes the Backlog only', async () => {
    const t = setup({ [MON]: [task('m1', 'Mon one', MON, 1024)], backlog: [] });
    await t.loadWeek(MON);
    await new Promise((r) => setTimeout(r, 20));
    t.calls.length = 0;
    t.store.onEvent({
      id: '1',
      type: 'tasks.changed',
      data: { spaceId: SPACE, days: ['2026-10-22'], clientId: 'tab-b' },
    });
    await vi.waitFor(() => expect(t.calls).toEqual([`GET /api/spaces/${SPACE}/days/2026-10-22`]));
    t.calls.length = 0;
    t.store.onEvent({
      id: '2',
      type: 'tasks.changed',
      data: { spaceId: SPACE, days: [null], clientId: 'tab-b' },
    });
    await vi.waitFor(() => expect(t.calls).toEqual([`GET /api/spaces/${SPACE}/backlog`]));
    t.calls.length = 0;
    // a move another tab made: both lists, and nothing else
    t.store.onEvent({
      id: '3',
      type: 'tasks.changed',
      data: { spaceId: SPACE, days: [MON, null], clientId: 'tab-b' },
    });
    await vi.waitFor(() =>
      expect(t.calls.sort()).toEqual([
        `GET /api/spaces/${SPACE}/backlog`,
        `GET /api/spaces/${SPACE}/days/${MON}`,
      ]),
    );
    expect(t.calls.some((c) => c.includes('/weeks/'))).toBe(false);
  });
});

describe('C06-U07 the Backlog in the store', () => {
  const two = () => ({
    backlog: [
      task('b1', 'Waiting', null as unknown as string, 1024),
      task('b2', 'Also', null as unknown as string, 2048),
    ],
  });

  it('C06-U07 a task written with no day lands at the end of the Backlog cache with the next position', async () => {
    const t = setup(two());
    await t.loadBacklog();
    const id = t.store.create(SPACE, null, 'Renew passport');
    expect(t.readBacklog().map((x) => [x.id, x.day])).toEqual([
      ['b1', null],
      ['b2', null],
      [id, null],
    ]);
    expect(t.readBacklog()[2]!.position).toBeGreaterThan(2048);
    // slotted in above the second row by the "+"
    const id2 = t.store.create(SPACE, null, 'Between', 1);
    expect(t.readBacklog().map((x) => x.id)).toEqual(['b1', id2, 'b2', id]);
  });

  it('C06-U07 crossing off keeps the task cached in the Backlog and queues one change; Undo queues the reverse', async () => {
    const t = setup(two());
    const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
    t.answer((body) => {
      sent.push(...(body.mutations as never[]));
      return { results: body.mutations.map((m) => ({ id: m.id, status: 'ok' })), tasks: [], deleted: [] };
    });
    await t.loadBacklog();
    t.store.cross('b1', true);
    expect(t.readBacklog().map((x) => [x.id, x.done, x.position])).toEqual([
      ['b1', true, 1024],
      ['b2', false, 2048],
    ]);
    expect(t.readBacklog()[0]!.doneAt).not.toBeNull();
    t.store.cross('b1', false);
    expect(t.readBacklog().map((x) => [x.id, x.done])).toEqual([
      ['b1', false],
      ['b2', false],
    ]);
    await t.settle();
    expect(sent.map((m) => [m.type, m.payload.id, m.payload.done])).toEqual([
      ['task.cross', 'b1', true],
      ['task.cross', 'b1', false],
    ]);
  });

  it('C06-U07 a reorder in the Backlog queues one place change with the day null', async () => {
    const t = setup(two());
    const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
    t.answer((body) => {
      sent.push(...(body.mutations as never[]));
      return { results: body.mutations.map((m) => ({ id: m.id, status: 'ok' })), tasks: [], deleted: [] };
    });
    await t.loadBacklog();
    t.store.place('b2', null, 0);
    expect(t.readBacklog().map((x) => x.id)).toEqual(['b2', 'b1']);
    await t.settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'task.place', payload: { id: 'b2', day: null } });
    expect(sent[0]!.payload.position).toBeLessThan(1024);
  });
});

describe('C21 All spaces in the store', () => {
  const HOME = 'space-home';
  const WORK = 'space-work';

  /** Two spaces on one day, places held by the pretend server, every sync recorded. */
  function two(places: Array<{ taskId: string; day: string | null; position: number }> = []) {
    const days: Record<string, Task[]> = {
      [HOME]: [task('h1', 'Home one', SUN, 1024, { spaceId: HOME })],
      [WORK]: [
        task('w1', 'Work one', SUN, 1024, { spaceId: WORK }),
        task('w2', 'Work two', SUN, 2048, { spaceId: WORK }),
      ],
    };
    const calls: string[] = [];
    const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      calls.push(`${init?.method ?? 'GET'} ${u.pathname}${u.search}`);
      if (u.pathname === '/api/sync') {
        const body = JSON.parse(String(init!.body)) as {
          mutations: Array<{ id: string; type: string; payload: Record<string, unknown> }>;
        };
        sent.push(...body.mutations.map((m) => ({ type: m.type, payload: m.payload })));
        const res: SyncResponse = {
          results: body.mutations.map((m) => ({ id: m.id, status: 'ok' })),
          tasks: [],
          deleted: [],
        };
        return new Response(JSON.stringify(res), { status: 200 });
      }
      if (u.pathname === '/api/all-spaces/places')
        return new Response(JSON.stringify({ places }), { status: 200 });
      const m = /\/spaces\/([^/]+)\/days\/([^/]+)$/.exec(u.pathname)!;
      const body: DayResponse = { day: m[2]!, tasks: days[m[1]!] ?? [], counts: { total: 0, done: 0 } };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const store = new TaskStore({
      api: createApi({ baseUrl: 'http://api.test', fetch: fetch as unknown as typeof globalThis.fetch }),
      queryClient,
      store: new MemoryOutboxStore(),
      clientId: 'tab-a',
      me: () => ({ id: 'me', name: 'Rohit Raj', email: 'rohit@test.tudu' }),
      newId: () => 'new-1',
    });
    const load = async () => {
      for (const o of [store.dayQuery(HOME, SUN), store.dayQuery(WORK, SUN)]) {
        await queryClient.fetchQuery(o);
        new QueryObserver(queryClient, o).subscribe(() => {});
      }
      const p = store.allPlacesQuery(SUN, SUN);
      await queryClient.fetchQuery(p);
      new QueryObserver(queryClient, p).subscribe(() => {});
    };
    const read = (s: string) => queryClient.getQueryData<DayData>(dayKey(s, SUN))?.tasks ?? [];
    const readPlaces = () => queryClient.getQueryData(allPlacesKey(SUN, SUN)) as AllSpacesPlace[];
    const settle = async () => {
      for (let i = 0; i < 50 && !(await store.idle()); i++) await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => setTimeout(r, 0));
    };
    return { store, queryClient, calls, sent, load, read, readPlaces, settle };
  }

  it('C21-U06 placeInAll sends only all.place and leaves every space position alone; tight neighbours renumber the day in one batch', async () => {
    const t = two([
      { taskId: 'h1', day: SUN, position: 1024 },
      { taskId: 'w1', day: SUN, position: 2048 },
      { taskId: 'w2', day: SUN, position: 3072 },
    ]);
    await t.load();
    t.store.placeInAll('w2', SUN, 0, [
      { id: 'h1', position: 1024 },
      { id: 'w1', position: 2048 },
      { id: 'w2', position: 3072 },
    ]);
    // At once: the place shows, no space list moved.
    expect(t.readPlaces().find((p) => p.taskId === 'w2')!.position).toBeLessThan(1024);
    expect(t.read(WORK).map((x) => [x.id, x.position])).toEqual([
      ['w1', 1024],
      ['w2', 2048],
    ]);
    await t.settle();
    expect(t.sent.map((m) => m.type)).toEqual(['all.place']);
    expect(t.sent[0]!.payload).toMatchObject({ id: 'w2', day: SUN });

    // Neighbours one apart: the whole day is numbered afresh, sent together.
    t.sent.length = 0;
    t.store.placeInAll('h1', SUN, 1, [
      { id: 'w2', position: 1 },
      { id: 'w1', position: 1 + 1e-7 },
      { id: 'h1', position: 3 },
    ]);
    await t.settle();
    expect(t.sent.map((m) => [m.type, m.payload.id])).toEqual([
      ['all.place', 'w2'],
      ['all.place', 'h1'],
      ['all.place', 'w1'],
    ]);
    const pos = t.sent.map((m) => m.payload.position as number);
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
    expect(t.sent.every((m) => m.type === 'all.place')).toBe(true);
  });

  it('C21-U07 moveInAll sends task.place (day, position null) then all.place, in order, for the task’s own space', async () => {
    const t = two();
    await t.load();
    t.store.moveInAll('w1', MON, 0, [{ id: 'x1', position: 1024 }]);
    expect(t.read(WORK).map((x) => x.id)).toEqual(['w2']);
    await t.settle();
    expect(t.sent.map((m) => m.type)).toEqual(['task.place', 'all.place']);
    expect(t.sent[0]!.payload).toEqual({ id: 'w1', day: MON, position: null });
    expect(t.sent[1]!.payload).toMatchObject({ id: 'w1', day: MON });
    // Not in the space's Sunday list any more, and Home's list never moved.
    expect(t.read(HOME).map((x) => x.id)).toEqual(['h1']);
  });

  it('C21-U08 writes from All spaces change the task’s own space only; create goes to the space it is given', async () => {
    const t = two();
    await t.load();
    t.store.cross('w1', true);
    t.store.rename('h1', 'Home renamed');
    expect(t.read(WORK).find((x) => x.id === 'w1')!.done).toBe(true);
    expect(t.read(HOME).find((x) => x.id === 'h1')!.title).toBe('Home renamed');
    expect(t.read(HOME).some((x) => x.id === 'w1')).toBe(false);
    expect(t.read(WORK).some((x) => x.id === 'h1')).toBe(false);
    // The writing line in All spaces passes Personal (or the filtered space): the task lands there and nowhere else.
    t.store.create(HOME, SUN, 'From All spaces');
    expect(t.read(HOME).map((x) => x.title)).toContain('From All spaces');
    expect(t.read(WORK).map((x) => x.title)).not.toContain('From All spaces');
    await t.settle();
    expect(t.sent.find((m) => m.type === 'task.create')!.payload).toMatchObject({ spaceId: HOME, day: SUN });
  });

  it('C21-U09 ALL_SPACES_CHANGED from another tab reads the places again, from this tab it does nothing; forgetSpace drops only that space', async () => {
    const t = two();
    await t.load();
    t.calls.length = 0;
    t.store.onEvent({ id: '1', type: ALL_SPACES_CHANGED, data: { days: [SUN], clientId: 'tab-a' } });
    await new Promise((r) => setTimeout(r, 20));
    expect(t.calls).toEqual([]);
    t.store.onEvent({ id: '2', type: ALL_SPACES_CHANGED, data: { days: [SUN], clientId: 'tab-b' } });
    await vi.waitFor(() => expect(t.calls).toEqual([`GET /api/all-spaces/places?from=${SUN}&to=${SUN}`]));

    t.store.forgetSpace(WORK);
    expect(t.queryClient.getQueryData(dayKey(WORK, SUN))).toBeUndefined();
    expect(t.read(HOME).map((x) => x.id)).toEqual(['h1']);
    expect(t.store.lastSeen('w1')).toBeUndefined();
    expect(t.store.lastSeen('h1')).toBeDefined();
  });
});
