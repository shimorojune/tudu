import type { QueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import {
  placeAt,
  POSITION_STEP,
  TASKS_CHANGED,
  taskIdOf,
  type Comment,
  type CommentAuthor,
  type DayResponse,
  type IsoDate,
  type MarksResponse,
  type Subtask,
  type SyncMutation,
  type SyncResponse,
  type Task,
  type TaskDetail,
  type TaskMutationBody,
  type TasksChangedEvent,
  type TaskVisibility,
} from '@tudu/core';
import { ApiError, type Api } from './api';
import type { LiveEvent } from './events';
import { Outbox, type Mutation, type OutboxStore } from './outbox';

/** A cached day: the tasks on it, in order, with every change not yet saved already applied. */
export interface DayData {
  day: IsoDate;
  tasks: Task[];
}

export const dayKey = (spaceId: string, day: IsoDate) => ['day', spaceId, day] as const;
export const marksKey = (spaceId: string, from: IsoDate, to: IsoDate) =>
  ['marks', spaceId, from, to] as const;
export const taskKey = (spaceId: string, taskId: string) => ['task', spaceId, taskId] as const;

function byPosition(a: { position: number; createdAt: string }, b: { position: number; createdAt: string }) {
  return a.position - b.position || a.createdAt.localeCompare(b.createdAt);
}

/** The task a create makes, as it looks before the server has numbered it. */
export function draftOf(m: Extract<SyncMutation, { type: 'task.create' }>, end = POSITION_STEP): Task {
  const p = m.payload;
  return {
    id: p.id,
    spaceId: p.spaceId,
    number: null,
    ref: null,
    title: p.title,
    day: p.day,
    position: p.position ?? end,
    done: false,
    doneAt: null,
    carriedFrom: null,
    due: null,
    visibility: 'space',
    subtasks: [],
    subsDone: 0,
    subsTotal: 0,
    commentCount: 0,
    createdAt: m.at,
    updatedAt: m.at,
  };
}

/** Apply a subtask mutation to a list of subtasks. Pure; anything else leaves the list as it is. */
export function applySubtasks(subtasks: Subtask[], taskId: string, m: SyncMutation): Subtask[] {
  if (!m.type.startsWith('subtask.') || taskIdOf(m) !== taskId) return subtasks;
  const id = m.payload.id;
  const end = () =>
    subtasks.length ? Math.max(...subtasks.map((s) => s.position)) + POSITION_STEP : POSITION_STEP;
  const map = (fn: (s: Subtask) => Subtask | null) =>
    subtasks.map((s) => (s.id === id ? fn(s) : s)).filter((s): s is Subtask => !!s);
  switch (m.type) {
    case 'subtask.create':
      if (subtasks.some((s) => s.id === id)) return subtasks;
      return [
        ...subtasks,
        {
          id,
          taskId,
          title: m.payload.title,
          position: m.payload.position ?? end(),
          done: false,
          createdAt: m.at,
          updatedAt: m.at,
        },
      ].sort(byPosition);
    case 'subtask.rename':
      return map((s) => ({ ...s, title: m.payload.title }));
    case 'subtask.cross':
      return map((s) => ({ ...s, done: m.payload.done }));
    case 'subtask.place':
      return map((s) => ({ ...s, position: m.payload.position })).sort(byPosition);
    case 'subtask.delete':
      return map(() => null);
    default:
      return subtasks;
  }
}

/** The counts the byline shows, from the list itself. */
function withCounts<T extends Task>(t: T): T {
  return { ...t, subsDone: t.subtasks.filter((s) => s.done).length, subsTotal: t.subtasks.length };
}

/** The fields of a task row one mutation changes (the day and position are handled by the list). */
function patchTask<T extends Task>(t: T, m: SyncMutation): T {
  switch (m.type) {
    case 'task.rename':
      return { ...t, title: m.payload.title };
    case 'task.cross':
      return { ...t, done: m.payload.done, doneAt: m.payload.done ? m.at : null };
    case 'task.keep':
      return { ...t, carriedFrom: null };
    case 'task.due':
      return { ...t, due: m.payload.due };
    case 'task.visibility':
      return { ...t, visibility: m.payload.visibility };
    case 'subtask.create':
    case 'subtask.rename':
    case 'subtask.cross':
    case 'subtask.place':
    case 'subtask.delete':
      return withCounts({ ...t, subtasks: applySubtasks(t.subtasks, t.id, m) });
    case 'comment.create':
      return { ...t, commentCount: t.commentCount + 1 };
    case 'comment.delete':
      return { ...t, commentCount: Math.max(0, t.commentCount - 1) };
    default:
      return t;
  }
}

/**
 * Apply one mutation to one day's list. Pure, and safe to apply twice: a create that is already there, or a change
 * the list already shows, leaves it as it is. `lookup` finds a task that is moving in from another day (or coming
 * back after a delete).
 */
export function applyToDay(
  tasks: Task[],
  day: IsoDate,
  spaceId: string,
  m: SyncMutation,
  lookup: (id: string) => Task | undefined,
): Task[] {
  const id = taskIdOf(m);
  const has = tasks.some((t) => t.id === id);
  const map = (fn: (t: Task) => Task) => tasks.map((t) => (t.id === id ? fn(t) : t));
  const end = () =>
    tasks.length ? Math.max(...tasks.map((t) => t.position)) + POSITION_STEP : POSITION_STEP;
  let out: Task[];
  switch (m.type) {
    case 'task.create': {
      if (has || m.payload.day !== day || m.payload.spaceId !== spaceId) return tasks;
      out = [...tasks, draftOf(m, end())];
      break;
    }
    case 'task.delete':
      out = tasks.filter((t) => t.id !== id);
      break;
    case 'task.restore': {
      if (has) return tasks;
      const t = lookup(id);
      if (!t || t.spaceId !== spaceId || t.day !== day) return tasks;
      out = [...tasks, t];
      break;
    }
    case 'task.place': {
      const to = m.payload.day;
      if (has && to !== day) out = tasks.filter((t) => t.id !== id);
      else if (has) out = map((t) => ({ ...t, position: m.payload.position ?? t.position }));
      else if (to === day) {
        const t = lookup(id);
        if (!t || t.spaceId !== spaceId) return tasks;
        out = [
          ...tasks,
          {
            ...t,
            day,
            position: m.payload.position ?? end(),
            carriedFrom: t.day === day ? t.carriedFrom : null,
          },
        ];
      } else return tasks;
      break;
    }
    default:
      if (!has) return tasks;
      out = map((t) => patchTask(t, m));
  }
  return [...out].sort(byPosition);
}

/** Apply one mutation to a task's full detail. Pure; a mutation for another task leaves it alone. */
export function applyToDetail(d: TaskDetail, m: SyncMutation, me: CommentAuthor | null): TaskDetail {
  if (taskIdOf(m) !== d.id) return d;
  const cms = (fn: (c: Comment) => Comment | null) =>
    d.comments.map((c) => (c.id === m.payload.id ? fn(c) : c)).filter((c): c is Comment => !!c);
  let next: TaskDetail;
  switch (m.type) {
    case 'task.create':
    case 'task.delete':
    case 'task.restore':
      return d;
    case 'task.place':
      next = { ...d, day: m.payload.day, position: m.payload.position ?? d.position };
      if (m.payload.day !== d.day) next.carriedFrom = null;
      break;
    case 'task.notes':
      next = { ...d, notes: m.payload.notes };
      break;
    case 'subtask.create':
    case 'subtask.rename':
    case 'subtask.cross':
    case 'subtask.place':
    case 'subtask.delete':
      next = { ...d, subtasks: applySubtasks(d.subtasks, d.id, m) };
      break;
    case 'comment.create':
      if (d.comments.some((c) => c.id === m.payload.id)) return d;
      next = {
        ...d,
        comments: [
          ...d.comments,
          {
            id: m.payload.id,
            taskId: d.id,
            author: me ?? { id: '', name: 'You', email: '' },
            html: m.payload.html,
            createdAt: m.at,
            editedAt: null,
          },
        ],
      };
      break;
    case 'comment.edit':
      next = { ...d, comments: cms((c) => ({ ...c, html: m.payload.html, editedAt: m.at })) };
      break;
    case 'comment.delete':
      next = { ...d, comments: cms(() => null) };
      break;
    default:
      next = patchTask(d, m);
  }
  return {
    ...next,
    subsTotal: next.subtasks.length,
    subsDone: next.subtasks.filter((s) => s.done).length,
    commentCount: next.comments.length,
  };
}

export interface TaskStoreOptions {
  api: Api;
  queryClient: QueryClient;
  store: OutboxStore;
  /** One per open tab. */
  clientId: string;
  /** Who is signed in, for the comments written here before the server answers. */
  me?: () => CommentAuthor | null;
  /** A change the server will never apply was undone; tell the person why. */
  onRejected?: (message: string) => void;
  /** The connection to the server came and went. */
  onReachable?: (reachable: boolean) => void;
  now?: () => Date;
  newId?: () => string;
}

interface Pending {
  m: SyncMutation;
  /** True once the outbox has it on disk; until then a sweep must leave it alone. */
  stored: boolean;
}

/**
 * The local-first task layer. Every change applies to the cached days and tasks at once and goes into the outbox;
 * the outbox replays it to `POST /api/sync`. What the server sends back replaces the cached rows, with the changes
 * still on their way applied on top, so a slow save never makes the list flicker. A change the server refuses is
 * undone by reading again, and the person is told why. Live events from other tabs and devices refresh only the
 * days and tasks they name.
 */
export class TaskStore {
  readonly outbox: Outbox;
  readonly clientId: string;
  private readonly pending = new Map<string, Pending>();
  /** The last known state of every task this tab has seen, for moves into a day and for Undo after a delete. */
  private readonly known = new Map<string, Task>();
  private lastAt = 0;
  private seq = 0;
  private reachable = true;

  constructor(private readonly o: TaskStoreOptions) {
    this.clientId = o.clientId;
    this.outbox = new Outbox({
      store: o.store,
      send: (batch) => this.send(batch),
      onIdle: () => this.sweep(),
      onError: (err) => {
        if (!(err instanceof ApiError)) this.setReachable(false);
      },
    });
  }

  /** Changes made in an earlier session that never reached the server: send them now. */
  async resume(): Promise<void> {
    const left = await this.o.store.all();
    for (const m of left) this.pending.set(m.id, { m: m as SyncMutation, stored: true });
    if (left.length) void this.outbox.flush();
  }

  // ---- reading -------------------------------------------------------------------------------------------

  /** One day of a space. Asking for today (by the client's working day) carries unfinished tasks forward. */
  dayQuery(spaceId: string, day: IsoDate, today?: IsoDate) {
    return queryOptions({
      queryKey: dayKey(spaceId, day),
      queryFn: async (): Promise<DayData> => {
        const q = today && today === day ? `?today=${today}` : '';
        const res = await this.o.api.get<DayResponse>(`/api/spaces/${spaceId}/days/${day}${q}`);
        this.setReachable(true);
        return { day, tasks: this.overlay(spaceId, day, res.tasks) };
      },
    });
  }

  marksQuery(spaceId: string, from: IsoDate, to: IsoDate) {
    return queryOptions({
      queryKey: marksKey(spaceId, from, to),
      queryFn: async () =>
        (await this.o.api.get<MarksResponse>(`/api/spaces/${spaceId}/marks?from=${from}&to=${to}`)).marks,
    });
  }

  /** One task in full, with the changes still on their way applied on top. */
  taskQuery(spaceId: string, taskId: string) {
    return queryOptions({
      queryKey: taskKey(spaceId, taskId),
      queryFn: async (): Promise<TaskDetail> => {
        const res = await this.o.api.get<TaskDetail>(`/api/spaces/${spaceId}/tasks/${taskId}`);
        this.setReachable(true);
        return this.overlayDetail(res);
      },
    });
  }

  /** The cached list of a day, if this tab has it. */
  cached(spaceId: string, day: IsoDate): Task[] | undefined {
    return this.o.queryClient.getQueryData<DayData>(dayKey(spaceId, day))?.tasks;
  }

  cachedTask(spaceId: string, taskId: string): TaskDetail | undefined {
    return this.o.queryClient.getQueryData<TaskDetail>(taskKey(spaceId, taskId));
  }

  /** What this tab last saw of a task, whether or not its day is open. */
  lastSeen(id: string): Task | undefined {
    return this.known.get(id);
  }

  // ---- changing ------------------------------------------------------------------------------------------

  /** Write a new task on a day, at `index` (the end when left out). Returns its id. */
  create(spaceId: string, day: IsoDate | null, title: string, index?: number): string {
    const id = this.o.newId?.() ?? crypto.randomUUID();
    const position = this.positionFor(spaceId, day, id, index);
    this.mutate({ type: 'task.create', payload: { id, spaceId, title: title.trim(), day, position } });
    return id;
  }

  rename(id: string, title: string): void {
    const t = title.trim();
    if (!t || this.known.get(id)?.title === t) return;
    this.mutate({ type: 'task.rename', payload: { id, title: t } });
  }

  cross(id: string, done: boolean): void {
    this.mutate({ type: 'task.cross', payload: { id, done } });
  }

  /** Clear the "→ From Sat" marker: it stays where it is. */
  keep(id: string): void {
    this.mutate({ type: 'task.keep', payload: { id } });
  }

  remove(id: string): void {
    this.mutate({ type: 'task.delete', payload: { id } });
  }

  /** Undo a delete: the task comes back on its day, in its place. */
  restore(id: string): void {
    this.mutate({ type: 'task.restore', payload: { id } });
  }

  due(id: string, due: IsoDate | null): void {
    this.mutate({ type: 'task.due', payload: { id, due } });
  }

  notes(id: string, notes: string): void {
    this.mutate({ type: 'task.notes', payload: { id, notes } });
  }

  visibility(id: string, visibility: TaskVisibility): void {
    this.mutate({ type: 'task.visibility', payload: { id, visibility } });
  }

  /**
   * Put a task on `day` at `index` (counted without the task itself; the end when left out). Reordering is a place
   * on the same day; moving is a place on another. When the neighbours are too close the whole day is renumbered.
   */
  place(id: string, day: IsoDate | null, index?: number): void {
    const t = this.known.get(id);
    if (!t) return;
    const list = day === null ? undefined : this.cached(t.spaceId, day);
    if (list && index !== undefined) {
      const others = list.filter((x) => x.id !== id);
      const placed = placeAt(
        others.map((x) => x.position),
        index,
      );
      if (placed.renumbered) {
        const order = [...others];
        order.splice(Math.min(index, order.length), 0, t);
        order.forEach((x, i) =>
          this.mutate({ type: 'task.place', payload: { id: x.id, day, position: placed.renumbered![i]! } }),
        );
        return;
      }
      this.mutate({ type: 'task.place', payload: { id, day, position: placed.position } });
      return;
    }
    this.mutate({ type: 'task.place', payload: { id, day, position: this.positionFor(t.spaceId, day, id) } });
  }

  // ---- subtasks and comments -----------------------------------------------------------------------------

  /** The subtasks of a task as this tab last saw them: from its open detail, else from its row. */
  private subtasksOf(spaceId: string, taskId: string): Subtask[] | undefined {
    return this.cachedTask(spaceId, taskId)?.subtasks ?? this.known.get(taskId)?.subtasks;
  }

  /** Add a subtask under a task, at the end (or at `index`). Returns its id. */
  addSubtask(spaceId: string, taskId: string, title: string, index?: number): string {
    const id = this.o.newId?.() ?? crypto.randomUUID();
    const subs = this.subtasksOf(spaceId, taskId);
    const position = subs
      ? placeAt(
          subs.map((s) => s.position),
          index ?? subs.length,
        ).position
      : null;
    this.mutate({ type: 'subtask.create', payload: { id, taskId, title: title.trim(), position } });
    return id;
  }

  renameSubtask(taskId: string, id: string, title: string): void {
    const t = title.trim();
    if (!t) return;
    this.mutate({ type: 'subtask.rename', payload: { id, taskId, title: t } });
  }

  crossSubtask(taskId: string, id: string, done: boolean): void {
    this.mutate({ type: 'subtask.cross', payload: { id, taskId, done } });
  }

  /** Put a subtask at `index` among its siblings (counted without itself). */
  placeSubtask(spaceId: string, taskId: string, id: string, index: number): void {
    const subs = this.subtasksOf(spaceId, taskId);
    if (!subs) return;
    const others = subs.filter((s) => s.id !== id);
    const placed = placeAt(
      others.map((s) => s.position),
      index,
    );
    if (placed.renumbered) {
      const order = [...others];
      const me = subs.find((s) => s.id === id)!;
      order.splice(Math.min(index, order.length), 0, me);
      order.forEach((s, i) =>
        this.mutate({
          type: 'subtask.place',
          payload: { id: s.id, taskId, position: placed.renumbered![i]! },
        }),
      );
      return;
    }
    this.mutate({ type: 'subtask.place', payload: { id, taskId, position: placed.position } });
  }

  removeSubtask(taskId: string, id: string): void {
    this.mutate({ type: 'subtask.delete', payload: { id, taskId } });
  }

  /** Restore a deleted subtask (Undo): a fresh create with the same words in the same place. */
  restoreSubtask(spaceId: string, taskId: string, sub: Subtask, index: number): string {
    const id = this.addSubtask(spaceId, taskId, sub.title, index);
    if (sub.done) this.crossSubtask(taskId, id, true);
    return id;
  }

  addComment(taskId: string, html: string): string {
    const id = this.o.newId?.() ?? crypto.randomUUID();
    this.mutate({ type: 'comment.create', payload: { id, taskId, html } });
    return id;
  }

  editComment(taskId: string, id: string, html: string): void {
    this.mutate({ type: 'comment.edit', payload: { id, taskId, html } });
  }

  removeComment(taskId: string, id: string): void {
    this.mutate({ type: 'comment.delete', payload: { id, taskId } });
  }

  /** Put a deleted comment back (Undo): a fresh comment with the same words. */
  restoreComment(taskId: string, html: string): string {
    return this.addComment(taskId, html);
  }

  /** True when nothing is waiting to be saved. Tests wait on this before asserting. */
  async idle(): Promise<boolean> {
    return (await this.outbox.idle()) && this.pending.size === 0;
  }

  // ---- the live stream -----------------------------------------------------------------------------------

  /** Refresh the days and tasks another tab or device changed. Our own changes are already on screen. */
  onEvent(e: LiveEvent): void {
    if (e.type !== TASKS_CHANGED) return;
    const ev = e.data as TasksChangedEvent;
    if (ev.clientId && ev.clientId === this.clientId) return;
    const qc = this.o.queryClient;
    for (const d of ev.days) {
      if (d) void qc.invalidateQueries({ queryKey: dayKey(ev.spaceId, d), exact: true });
    }
    for (const t of ev.tasks ?? [])
      void qc.invalidateQueries({ queryKey: taskKey(ev.spaceId, t), exact: true });
    void qc.invalidateQueries({ queryKey: ['marks', ev.spaceId] });
  }

  /** After the stream was down for a while: read every cached day and task again. */
  refreshAll(): void {
    void this.o.queryClient.invalidateQueries({ queryKey: ['day'] });
    void this.o.queryClient.invalidateQueries({ queryKey: ['task'] });
    void this.o.queryClient.invalidateQueries({ queryKey: ['marks'] });
  }

  stop(): void {
    this.outbox.stop();
  }

  /** Signing out: give unsaved changes a moment to land, then forget them and everything cached. */
  async clear(waitMs = 2000): Promise<void> {
    const until = Date.now() + waitMs;
    while (Date.now() < until && !(await this.idle())) await new Promise((r) => setTimeout(r, 50));
    for (const m of await this.o.store.all()) await this.o.store.remove(m.id);
    this.pending.clear();
    this.known.clear();
  }

  // ---- inside --------------------------------------------------------------------------------------------

  private nextAt(): string {
    const now = (this.o.now?.() ?? new Date()).getTime();
    this.lastAt = Math.max(now, this.lastAt);
    return new Date(this.lastAt).toISOString();
  }

  private mutate(body: TaskMutationBody): void {
    const m = { id: crypto.randomUUID(), at: this.nextAt(), seq: ++this.seq, ...body } as SyncMutation &
      Mutation;
    this.pending.set(m.id, { m, stored: false });
    this.applyEverywhere(m);
    void this.o.store.put(m).then(
      () => {
        const p = this.pending.get(m.id);
        if (p) p.stored = true;
        void this.outbox.flush();
      },
      () => void this.outbox.flush(),
    );
  }

  /** Apply a mutation to every cached day and task. */
  private applyEverywhere(m: SyncMutation): void {
    const qc = this.o.queryClient;
    const id = taskIdOf(m);
    // The task's detail first, so a day row can take its exact counts from it.
    for (const [key, data] of qc.getQueriesData<TaskDetail>({ queryKey: ['task'] })) {
      if (!data || data.id !== id) continue;
      const next = applyToDetail(data, m, this.o.me?.() ?? null);
      if (next !== data) qc.setQueryData<TaskDetail>(key, next);
    }
    const detail = [...qc.getQueriesData<TaskDetail>({ queryKey: ['task'] })].find(
      ([, d]) => d?.id === id,
    )?.[1];
    for (const [key, data] of qc.getQueriesData<DayData>({ queryKey: ['day'] })) {
      if (!data) continue;
      const [, spaceId, day] = key as unknown as [string, string, IsoDate];
      let next = applyToDay(data.tasks, day, spaceId, m, (x) => this.known.get(x));
      if (detail) next = next.map((t) => (t.id === id ? { ...t, commentCount: detail.commentCount } : t));
      if (next !== data.tasks) {
        this.remember(next);
        qc.setQueryData<DayData>(key, { day, tasks: next });
      }
    }
    // A task created on a day nobody has open is still known, so it can be moved before its day is read.
    if (m.type === 'task.create' && !this.known.has(m.payload.id)) this.known.set(m.payload.id, draftOf(m));
  }

  /** Server rows with every change still on its way applied on top. */
  private overlay(spaceId: string, day: IsoDate, rows: Task[]): Task[] {
    this.remember(rows);
    let tasks = [...rows].sort(byPosition);
    for (const { m } of this.pending.values())
      tasks = applyToDay(tasks, day, spaceId, m, (id) => this.known.get(id));
    this.remember(tasks);
    return tasks;
  }

  private overlayDetail(d: TaskDetail): TaskDetail {
    let out = d;
    for (const { m } of this.pending.values()) out = applyToDetail(out, m, this.o.me?.() ?? null);
    return out;
  }

  private remember(tasks: Task[]): void {
    for (const t of tasks) this.known.set(t.id, t);
  }

  private positionFor(spaceId: string, day: IsoDate | null, id: string, index?: number): number | null {
    const list = day === null ? undefined : this.cached(spaceId, day);
    if (!list) return null;
    const others = list.filter((x) => x.id !== id).map((x) => x.position);
    return placeAt(others, index ?? others.length).position;
  }

  private async send(batch: Mutation[]): Promise<{ done: string[] }> {
    const res = await this.o.api.post<SyncResponse>('/api/sync', {
      clientId: this.clientId,
      mutations: batch,
    });
    this.setReachable(true);
    const rejected = res.results.filter((r) => r.status === 'rejected');
    for (const r of res.results) this.pending.delete(r.id);
    this.merge(res);
    const touched = new Set<string>();
    for (const b of batch) touched.add(taskIdOf(b as SyncMutation));
    if (rejected.length) {
      // Undo by reading the days again: the server's rows plus whatever is still on its way.
      void this.o.queryClient.invalidateQueries({ queryKey: ['day'] });
      void this.o.queryClient.invalidateQueries({ queryKey: ['task'] });
      this.o.onRejected?.(rejected[0]!.error ?? 'That change couldn’t be saved.');
    } else {
      // The detail of each task touched reads again, so server-made facts (history, numbers) arrive.
      for (const [key, d] of this.o.queryClient.getQueriesData<TaskDetail>({ queryKey: ['task'] }))
        if (d && touched.has(d.id)) void this.o.queryClient.invalidateQueries({ queryKey: key, exact: true });
    }
    void this.o.queryClient.invalidateQueries({ queryKey: ['marks'] });
    return { done: res.results.map((r) => r.id) };
  }

  /** Put the rows the server sent back into the cached days, with later changes for them applied on top. */
  private merge(res: SyncResponse): void {
    const qc = this.o.queryClient;
    const rows = new Map(res.tasks.map((t) => [t.id, t]));
    const gone = new Set(res.deleted);
    if (!rows.size && !gone.size) return;
    this.remember(res.tasks);
    for (const [key, data] of qc.getQueriesData<DayData>({ queryKey: ['day'] })) {
      if (!data) continue;
      const [, spaceId, day] = key as unknown as [string, string, IsoDate];
      let tasks = data.tasks.filter((t) => !rows.has(t.id) && !gone.has(t.id));
      for (const t of rows.values()) if (t.spaceId === spaceId && t.day === day) tasks.push(t);
      for (const { m } of this.pending.values())
        if (rows.has(taskIdOf(m))) tasks = applyToDay(tasks, day, spaceId, m, (id) => this.known.get(id));
      tasks.sort(byPosition);
      if (!sameTasks(tasks, data.tasks)) qc.setQueryData<DayData>(key, { day, tasks });
    }
  }

  /** Everything on disk was sent (by this tab or another): forget what we were holding for it. */
  private sweep(): void {
    for (const [id, p] of this.pending) if (p.stored) this.pending.delete(id);
  }

  private setReachable(on: boolean): void {
    if (on === this.reachable) return;
    this.reachable = on;
    this.o.onReachable?.(on);
  }
}

function sameTasks(a: Task[], b: Task[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}
