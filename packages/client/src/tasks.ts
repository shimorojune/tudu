import type { QueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import {
  placeAt,
  POSITION_STEP,
  TASKS_CHANGED,
  type DayResponse,
  type IsoDate,
  type MarksResponse,
  type SyncMutation,
  type SyncResponse,
  type Task,
  type TaskMutationBody,
  type TasksChangedEvent,
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

function byPosition(a: Task, b: Task): number {
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
    createdAt: m.at,
    updatedAt: m.at,
  };
}

/**
 * Apply one mutation to one day's list. Pure, and safe to apply twice: a create that is already there, or a change
 * the list already shows, leaves it as it is. `lookup` finds a task that is moving in from another day.
 */
export function applyToDay(
  tasks: Task[],
  day: IsoDate,
  spaceId: string,
  m: SyncMutation,
  lookup: (id: string) => Task | undefined,
): Task[] {
  const p = m.payload;
  const has = tasks.some((t) => t.id === p.id);
  const map = (fn: (t: Task) => Task) => tasks.map((t) => (t.id === p.id ? fn(t) : t));
  const end = () =>
    tasks.length ? Math.max(...tasks.map((t) => t.position)) + POSITION_STEP : POSITION_STEP;
  let out = tasks;
  switch (m.type) {
    case 'task.create': {
      if (has || m.payload.day !== day || m.payload.spaceId !== spaceId) return tasks;
      out = [...tasks, draftOf(m, end())];
      break;
    }
    case 'task.rename':
      out = map((t) => ({ ...t, title: m.payload.title }));
      break;
    case 'task.cross':
      out = map((t) => ({ ...t, done: m.payload.done, doneAt: m.payload.done ? m.at : null }));
      break;
    case 'task.keep':
      out = map((t) => ({ ...t, carriedFrom: null }));
      break;
    case 'task.delete':
      out = tasks.filter((t) => t.id !== p.id);
      break;
    case 'task.place': {
      const to = m.payload.day;
      if (has && to !== day) out = tasks.filter((t) => t.id !== p.id);
      else if (has) out = map((t) => ({ ...t, position: m.payload.position ?? t.position }));
      else if (to === day) {
        const t = lookup(p.id);
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
  }
  return [...out].sort(byPosition);
}

export interface TaskStoreOptions {
  api: Api;
  queryClient: QueryClient;
  store: OutboxStore;
  /** One per open tab. */
  clientId: string;
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
 * The local-first task layer. Every change applies to the cached days at once and goes into the outbox; the outbox
 * replays it to `POST /api/sync`. What the server sends back replaces the cached rows, with the changes still on
 * their way applied on top, so a slow save never makes the list flicker. A change the server refuses is undone by
 * reading the day again, and the person is told why. Live events from other tabs and devices refresh only the days
 * they name.
 */
export class TaskStore {
  readonly outbox: Outbox;
  readonly clientId: string;
  private readonly pending = new Map<string, Pending>();
  /** The last known state of every task this tab has seen, for moves into a day. */
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

  /** The cached list of a day, if this tab has it. */
  cached(spaceId: string, day: IsoDate): Task[] | undefined {
    return this.o.queryClient.getQueryData<DayData>(dayKey(spaceId, day))?.tasks;
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

  /** True when nothing is waiting to be saved. Tests wait on this before asserting. */
  async idle(): Promise<boolean> {
    return (await this.outbox.idle()) && this.pending.size === 0;
  }

  // ---- the live stream -----------------------------------------------------------------------------------

  /** Refresh the days another tab or device changed. Our own changes are already on screen. */
  onEvent(e: LiveEvent): void {
    if (e.type !== TASKS_CHANGED) return;
    const ev = e.data as TasksChangedEvent;
    if (ev.clientId && ev.clientId === this.clientId) return;
    for (const d of ev.days) {
      if (d) void this.o.queryClient.invalidateQueries({ queryKey: dayKey(ev.spaceId, d), exact: true });
    }
    void this.o.queryClient.invalidateQueries({ queryKey: ['marks', ev.spaceId] });
  }

  /** After the stream was down for a while: read every cached day again. */
  refreshAll(): void {
    void this.o.queryClient.invalidateQueries({ queryKey: ['day'] });
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

  /** Apply a mutation to every cached day. */
  private applyEverywhere(m: SyncMutation): void {
    const qc = this.o.queryClient;
    for (const [key, data] of qc.getQueriesData<DayData>({ queryKey: ['day'] })) {
      if (!data) continue;
      const [, spaceId, day] = key as unknown as [string, string, IsoDate];
      const next = applyToDay(data.tasks, day, spaceId, m, (id) => this.known.get(id));
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
    if (rejected.length) {
      // Undo by reading the days again: the server's rows plus whatever is still on its way.
      void this.o.queryClient.invalidateQueries({ queryKey: ['day'] });
      this.o.onRejected?.(rejected[0]!.error ?? 'That change couldn’t be saved.');
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
        if (rows.has(m.payload.id)) tasks = applyToDay(tasks, day, spaceId, m, (id) => this.known.get(id));
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
