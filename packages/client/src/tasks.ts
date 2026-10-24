import type { QueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import {
  INBOX_CHANGED,
  isInboxMutation,
  isProjectMutation,
  isSettingsMutation,
  MEMBERS_CHANGED,
  SPACE_CHANGED,
  SPACE_GONE,
  type SpaceGoneEvent,
  type SpaceSummary,
  nextProjectColor,
  placeAt,
  POSITION_STEP,
  PROJECTS_CHANGED,
  TASKS_CHANGED,
  taskIdOf,
  type Attachment,
  type BacklogResponse,
  type Comment,
  type CommentAuthor,
  type DayResponse,
  type InboxChangedEvent,
  type InboxItem,
  type InboxResponse,
  type InboxView,
  type IsoDate,
  JIRA_CHANGED,
  type JiraChangedEvent,
  type JiraLinksResponse,
  type MarksResponse,
  type MembersChangedEvent,
  type MembersResponse,
  type PeopleResponse,
  type PersonResponse,
  type Project,
  type ProjectsChangedEvent,
  type Subtask,
  type SyncMutation,
  type SyncResponse,
  type Task,
  type TaskDetail,
  type TaskMutationBody,
  type TaskRequest,
  type TasksChangedEvent,
  type TaskVisibility,
  type WeekResponse,
} from '@tudu/core';
import { ApiError, type Api } from './api';
import type { MeResponse } from './auth';
import { tickGettingStarted } from './firstRun';
import type { LiveEvent } from './events';
import { applyToLinks, jiraLinksKey } from './jira';
import { Outbox, type Mutation, type OutboxStore } from './outbox';

/** A cached day (or the Backlog, day null): the tasks on it, in order, with every change not yet saved applied. */
export interface DayData {
  day: IsoDate | null;
  tasks: Task[];
}

/** What a week read keeps for itself: the day caches hold the lists. */
export interface WeekData {
  monday: IsoDate;
  days: IsoDate[];
}

export const dayKey = (spaceId: string, day: IsoDate | null) => ['day', spaceId, day] as const;
export const weekKey = (spaceId: string, monday: IsoDate) => ['week', spaceId, monday] as const;
export const marksKey = (spaceId: string, from: IsoDate, to: IsoDate) =>
  ['marks', spaceId, from, to] as const;
export const taskKey = (spaceId: string, taskId: string) => ['task', spaceId, taskId] as const;
export const projectsKey = (spaceId: string) => ['projects', spaceId] as const;
export const membersKey = (spaceId: string) => ['members', spaceId] as const;
export const peopleKey = (spaceId: string, from: IsoDate, to: IsoDate) =>
  ['people', spaceId, from, to] as const;
export const personKey = (spaceId: string, userId: string, from: IsoDate, to: IsoDate) =>
  ['people', spaceId, 'one', userId, from, to] as const;
/** The one Inbox: every space, or one (`spaceId`), in a view, narrowed by words. */
export const inboxKey = (view: InboxView, q = '', spaceId: string | null = null) =>
  ['inbox', spaceId ?? 'all', view, q] as const;

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
    due: p.due ?? null,
    visibility: 'space',
    projectId: p.projectId ?? null,
    jira: p.jira ?? null,
    ownerId: null,
    subtasks: [],
    subsDone: 0,
    subsTotal: 0,
    commentCount: 0,
    createdAt: m.at,
    updatedAt: m.at,
  };
}

/** Apply a project mutation to a space's project list. Pure. */
export function applyToProjects(projects: Project[], spaceId: string, m: SyncMutation): Project[] {
  if (!isProjectMutation(m) || m.payload.spaceId !== spaceId) return projects;
  switch (m.type) {
    case 'project.create':
      if (projects.some((p) => p.id === m.payload.id)) return projects;
      return [
        ...projects,
        {
          id: m.payload.id,
          spaceId,
          name: m.payload.name,
          color: m.payload.color ?? nextProjectColor(projects.map((p) => p.color)),
          position: (projects.at(-1)?.position ?? 0) + POSITION_STEP,
          createdAt: m.at,
        },
      ];
    case 'project.update':
      return projects
        .map((p) =>
          p.id === m.payload.id
            ? {
                ...p,
                name: m.payload.name ?? p.name,
                color: m.payload.color ?? p.color,
                position: m.payload.position ?? p.position,
              }
            : p,
        )
        .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
    case 'project.delete':
      return projects.filter((p) => p.id !== m.payload.id);
    case 'project.restore':
      return projects;
  }
}

/** Apply a change to you or to a space onto the `/api/me` answer. Pure. */
export function applyToMe(me: MeResponse, m: SyncMutation): MeResponse {
  if (m.type === 'me.rename') return { ...me, user: { ...me.user, name: m.payload.name } };
  if (m.type === 'space.update') {
    const p = m.payload;
    return {
      ...me,
      spaces: me.spaces.map((s): SpaceSummary =>
        s.id === p.id ? { ...s, name: p.name ?? s.name, color: p.color ?? s.color } : s,
      ),
    };
  }
  return me;
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
    case 'task.project':
      return { ...t, projectId: m.payload.projectId };
    case 'task.jira':
      return { ...t, jira: m.payload.jira };
    case 'project.delete':
      return t.projectId === m.payload.id ? { ...t, projectId: null } : t;
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
  day: IsoDate | null,
  spaceId: string,
  m: SyncMutation,
  lookup: (id: string) => Task | undefined,
): Task[] {
  if (isProjectMutation(m)) {
    if (m.type !== 'project.delete' || m.payload.spaceId !== spaceId) return tasks;
    const hit = tasks.some((t) => t.projectId === m.payload.id);
    return hit ? tasks.map((t) => patchTask(t, m)) : tasks;
  }
  // A request is not a task until it is accepted; the store writes the accepted task into its day itself.
  if (isInboxMutation(m) || isSettingsMutation(m)) return tasks;
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
  if (isInboxMutation(m) || isSettingsMutation(m)) return d;
  if (isProjectMutation(m)) {
    if (m.type === 'project.delete' && d.projectId === m.payload.id) return { ...d, projectId: null };
    return d;
  }
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
  /** You are no longer in a space (deleted, removed, or left in another tab). */
  onSpaceGone?: (e: SpaceGoneEvent) => void;
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
  /** Changes made here the server has not answered yet, whatever the outbox has on disk. */
  private unanswered = 0;
  /** Projects deleted here, and the tasks they were on, so Undo can put them back at once. */
  private readonly deletedProjects = new Map<string, { project: Project; tasks: Set<string> }>();

  constructor(private readonly o: TaskStoreOptions) {
    this.clientId = o.clientId;
    this.outbox = new Outbox({
      store: o.store,
      send: (batch) => this.send(batch),
      onIdle: () => void this.sweep(),
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

  /** The Backlog: the tasks with no day, in their order. Cached as the day `null`. */
  backlogQuery(spaceId: string) {
    return queryOptions({
      queryKey: dayKey(spaceId, null),
      queryFn: async (): Promise<DayData> => {
        const res = await this.o.api.get<BacklogResponse>(`/api/spaces/${spaceId}/backlog`);
        this.setReachable(true);
        return { day: null, tasks: this.overlay(spaceId, null, res.tasks) };
      },
    });
  }

  /** A day of a space, or the Backlog for null. */
  listQuery(spaceId: string, day: IsoDate | null, today?: IsoDate) {
    return day === null ? this.backlogQuery(spaceId) : this.dayQuery(spaceId, day, today);
  }

  /**
   * A whole week in one read: the seven days from `monday` and the Backlog. Each list lands in its own day cache,
   * so the tiles, Today and the live stream all share them; asking for the week that holds today carries
   * unfinished tasks forward first.
   */
  weekQuery(spaceId: string, monday: IsoDate, today?: IsoDate) {
    return queryOptions({
      queryKey: weekKey(spaceId, monday),
      queryFn: async (): Promise<WeekData> => {
        const q = today ? `?today=${today}` : '';
        const res = await this.o.api.get<WeekResponse>(`/api/spaces/${spaceId}/weeks/${monday}${q}`);
        this.setReachable(true);
        const qc = this.o.queryClient;
        for (const d of res.days)
          qc.setQueryData<DayData>(dayKey(spaceId, d.day), {
            day: d.day,
            tasks: this.overlay(spaceId, d.day, d.tasks),
          });
        qc.setQueryData<DayData>(dayKey(spaceId, null), {
          day: null,
          tasks: this.overlay(spaceId, null, res.backlog),
        });
        return { monday: res.monday, days: res.days.map((d) => d.day) };
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

  /** The cached list of a day (or the Backlog), if this tab has it. */
  cached(spaceId: string, day: IsoDate | null): Task[] | undefined {
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

  /**
   * Write a new task on a day, at `index` (the end when left out). Quick Add gives it more at birth: a due day, a
   * project, notes and the files uploaded for it. Returns its id.
   */
  create(
    spaceId: string,
    day: IsoDate | null,
    title: string,
    index?: number,
    extra: {
      due?: IsoDate | null;
      projectId?: string | null;
      notes?: string;
      attachments?: string[];
      /** A Jira issue's key: the task is made linked to it. */
      jira?: string;
      source?: 'quick-add' | 'jira';
    } = {},
  ): string {
    const id = this.o.newId?.() ?? crypto.randomUUID();
    const position = this.positionFor(spaceId, day, id, index);
    const payload: Extract<TaskMutationBody, { type: 'task.create' }>['payload'] = {
      id,
      spaceId,
      title: title.trim(),
      day,
      position,
    };
    if (extra.due !== undefined) payload.due = extra.due;
    if (extra.projectId !== undefined) payload.projectId = extra.projectId;
    if (extra.notes) payload.notes = extra.notes;
    if (extra.attachments?.length) payload.attachments = extra.attachments;
    if (extra.jira) payload.jira = extra.jira;
    if (extra.source) payload.source = extra.source;
    this.mutate({ type: 'task.create', payload });
    return id;
  }

  setProject(id: string, projectId: string | null): void {
    this.mutate({ type: 'task.project', payload: { id, projectId } });
  }

  /** Link a task to a Jira issue by its key, or unlink it (null). */
  linkJira(id: string, jira: string | null): void {
    this.mutate({ type: 'task.jira', payload: { id, jira } });
  }

  // ---- projects ------------------------------------------------------------------------------------------

  /** How many open tasks each project of a space has (Settings › Space). */
  projectCountsQuery(spaceId: string) {
    return queryOptions({
      queryKey: [...projectsKey(spaceId), 'open'] as const,
      queryFn: async (): Promise<Record<string, number>> =>
        (await this.o.api.get<{ open: Record<string, number> }>(`/api/spaces/${spaceId}/projects?counts=1`))
          .open,
    });
  }

  projectsQuery(spaceId: string) {
    return queryOptions({
      queryKey: projectsKey(spaceId),
      queryFn: async (): Promise<Project[]> => {
        const res = await this.o.api.get<{ projects: Project[] }>(`/api/spaces/${spaceId}/projects`);
        this.setReachable(true);
        let list = res.projects;
        for (const { m } of this.pending.values()) list = applyToProjects(list, spaceId, m);
        return list;
      },
    });
  }

  // ---- people --------------------------------------------------------------------------------------------

  /** Who is in a space, and who is invited. */
  membersQuery(spaceId: string) {
    return queryOptions({
      queryKey: membersKey(spaceId),
      queryFn: async (): Promise<MembersResponse> => {
        const res = await this.o.api.get<MembersResponse>(`/api/spaces/${spaceId}/members`);
        this.setReachable(true);
        return res;
      },
    });
  }

  /** Everyone's shared tasks between two days, by member. */
  peopleQuery(spaceId: string, from: IsoDate, to: IsoDate) {
    return queryOptions({
      queryKey: peopleKey(spaceId, from, to),
      queryFn: async (): Promise<PeopleResponse> => {
        const res = await this.o.api.get<PeopleResponse>(
          `/api/spaces/${spaceId}/people?from=${from}&to=${to}`,
        );
        this.setReachable(true);
        return res;
      },
    });
  }

  /** One person's shared tasks between two days. */
  personQuery(spaceId: string, userId: string, from: IsoDate, to: IsoDate) {
    return queryOptions({
      queryKey: personKey(spaceId, userId, from, to),
      queryFn: async (): Promise<PersonResponse> => {
        const res = await this.o.api.get<PersonResponse>(
          `/api/spaces/${spaceId}/people/${userId}?from=${from}&to=${to}`,
        );
        this.setReachable(true);
        return res;
      },
    });
  }

  // ---- the Inbox ------------------------------------------------------------------------------------------

  /** One view of the Inbox across every space (or one), narrowed by words. Reads live, like every list. */
  inboxQuery(view: InboxView, q = '', spaceId: string | null = null) {
    return queryOptions({
      queryKey: inboxKey(view, q, spaceId),
      queryFn: async (): Promise<InboxResponse> => {
        const res = await this.o.api.get<InboxResponse>(
          `/api/inbox?view=${view}&q=${encodeURIComponent(q)}${spaceId ? `&space=${spaceId}` : ''}`,
        );
        this.setReachable(true);
        return res;
      },
    });
  }

  /** Send someone a task: a request in their Inbox in that space. Returns the request's id. */
  sendRequest(
    spaceId: string,
    toId: string,
    task: {
      title: string;
      note?: string;
      askedDay: IsoDate | null;
      due?: IsoDate | null;
      projectId?: string | null;
      attachments?: string[];
    },
  ): string {
    const id = this.o.newId?.() ?? crypto.randomUUID();
    const payload: Extract<TaskMutationBody, { type: 'request.send' }>['payload'] = {
      id,
      spaceId,
      toId,
      title: task.title.trim(),
      askedDay: task.askedDay,
    };
    if (task.note?.trim()) payload.note = task.note.trim();
    if (task.due !== undefined) payload.due = task.due;
    if (task.projectId !== undefined) payload.projectId = task.projectId;
    if (task.attachments?.length) payload.attachments = task.attachments;
    this.mutate({ type: 'request.send', payload });
    return id;
  }

  /** The task a request becomes on this side, before the server has numbered it. */
  private draftFromRequest(r: TaskRequest, taskId: string, day: IsoDate | null, at: string): Task {
    const list = this.cached(r.spaceId, day);
    const end = list?.length ? Math.max(...list.map((t) => t.position)) + POSITION_STEP : POSITION_STEP;
    return {
      id: taskId,
      spaceId: r.spaceId,
      number: null,
      ref: null,
      title: r.title,
      day,
      position: end,
      done: false,
      doneAt: null,
      carriedFrom: null,
      due: r.due,
      visibility: 'space',
      projectId: r.projectId,
      jira: null,
      ownerId: this.o.me?.()?.id ?? null,
      subtasks: [],
      subsDone: 0,
      subsTotal: 0,
      commentCount: 0,
      createdAt: at,
      updatedAt: at,
    };
  }

  /** Put a task the store made itself (an accepted or taken-back request) into its day, if that day is cached. */
  private placeDraft(t: Task): void {
    const qc = this.o.queryClient;
    const key = dayKey(t.spaceId, t.day);
    const data = qc.getQueryData<DayData>(key);
    this.known.set(t.id, t);
    if (data && !data.tasks.some((x) => x.id === t.id))
      qc.setQueryData<DayData>(key, { day: t.day, tasks: [...data.tasks, t].sort(byPosition) });
  }

  /** Mark a request answered (or gone) in every cached Inbox view, so it folds out at once. */
  private settleRequest(
    spaceId: string,
    requestId: string,
    patch: Partial<TaskRequest>,
    remove = false,
  ): void {
    const qc = this.o.queryClient;
    void spaceId;
    for (const [key, data] of qc.getQueriesData<InboxResponse>({ queryKey: ['inbox'] })) {
      if (!data) continue;
      const fix = (list: typeof data.toAnswer) =>
        list
          .filter((i) => !(remove && i.request?.id === requestId))
          .map((i) => (i.request?.id === requestId ? { ...i, request: { ...i.request, ...patch } } : i));
      const toAnswer = fix(data.toAnswer).filter((i) => i.request?.state === 'waiting');
      qc.setQueryData<InboxResponse>(key, {
        ...data,
        toAnswer,
        updates: fix(data.updates),
        answered: fix(data.answered),
        sent: data.sent
          .filter((r) => !(remove && r.id === requestId))
          .map((r) => (r.id === requestId ? { ...r, ...patch } : r)),
        counts: { ...data.counts, toAnswer: toAnswer.length },
      });
    }
  }

  /** Accept a request onto a day (the Backlog for null): the task is yours at once. Returns its id. */
  acceptRequest(r: TaskRequest, day: IsoDate | null): string {
    const taskId = this.o.newId?.() ?? crypto.randomUUID();
    const at = this.nextAt();
    this.mutate({ type: 'request.accept', payload: { id: r.id, taskId, day } });
    this.placeDraft(this.draftFromRequest(r, taskId, day, at));
    this.settleRequest(r.spaceId, r.id, { state: 'accepted', taskId, taskDay: day, answeredAt: at });
    return taskId;
  }

  declineRequest(r: TaskRequest, reason: string): void {
    this.mutate({ type: 'request.decline', payload: { id: r.id, reason: reason.trim() } });
    this.settleRequest(r.spaceId, r.id, {
      state: 'declined',
      reason: reason.trim(),
      answeredAt: this.nextAt(),
    });
  }

  /** Take a request back (or Do it myself): a task of your own on the day, the Backlog for null. Returns its id. */
  withdrawRequest(r: TaskRequest, day: IsoDate | null): string {
    const taskId = this.o.newId?.() ?? crypto.randomUUID();
    const at = this.nextAt();
    this.mutate({ type: 'request.withdraw', payload: { id: r.id, taskId, day } });
    this.placeDraft(this.draftFromRequest(r, taskId, day, at));
    this.settleRequest(r.spaceId, r.id, { state: 'withdrawn', taskId, taskDay: day }, true);
    return taskId;
  }

  /** Change Inbox items in every cached view at once: `fn` gives each item its new self, or null to drop it. */
  private patchInbox(fn: (i: InboxItem) => InboxItem | null): void {
    const qc = this.o.queryClient;
    for (const [key, data] of qc.getQueriesData<InboxResponse>({ queryKey: ['inbox'] })) {
      if (!data) continue;
      const map = (list: InboxItem[]) => list.map(fn).filter((i): i is InboxItem => i !== null);
      const toAnswer = map(data.toAnswer);
      const updates = map(data.updates);
      const answered = map(data.answered);
      const gone = (list: InboxItem[], next: InboxItem[]) =>
        list.filter((i) => !next.some((n) => n.id === i.id));
      // The counts across every space follow what changed in this view.
      const unreadBefore = data.updates.filter((i) => !i.readAt).length;
      const unreadAfter = updates.filter((i) => !i.readAt).length;
      qc.setQueryData<InboxResponse>(key, {
        ...data,
        toAnswer,
        updates,
        answered,
        counts: {
          toAnswer: Math.max(0, data.counts.toAnswer - gone(data.toAnswer, toAnswer).length),
          unread: Math.max(0, data.counts.unread + unreadAfter - unreadBefore),
        },
      });
    }
  }

  /** Reading an item clears its dot (and tells a request's sender it was seen). */
  readItem(itemId: string): void {
    const at = this.nextAt();
    this.patchInbox((i) => (i.id === itemId && !i.readAt ? { ...i, readAt: at } : i));
    this.mutate({ type: 'inbox.read', payload: { id: itemId } });
  }

  /** Mark as unread: the dot comes back. */
  unreadItem(itemId: string): void {
    this.patchInbox((i) => (i.id === itemId ? { ...i, readAt: null } : i));
    this.mutate({ type: 'inbox.unread', payload: { id: itemId } });
  }

  /** Delete one item (Not now on an invite too). Restore puts it back. */
  deleteItem(itemId: string): void {
    this.patchInbox((i) => (i.id === itemId ? null : i));
    this.mutate({ type: 'inbox.delete', payload: { id: itemId } });
  }

  /** Clear all: exactly these items go. Restore puts them back. */
  clearItems(ids: string[]): void {
    if (!ids.length) return;
    const set = new Set(ids);
    this.patchInbox((i) => (set.has(i.id) ? null : i));
    this.mutate({ type: 'inbox.clear', payload: { id: this.o.newId?.() ?? crypto.randomUUID(), ids } });
  }

  /** Undo a delete or Clear all: the server has them, so read the Inbox again once it has heard. */
  restoreItems(ids: string[]): void {
    if (!ids.length) return;
    this.mutate({ type: 'inbox.restore', payload: { id: this.o.newId?.() ?? crypto.randomUUID(), ids } });
  }

  cachedProjects(spaceId: string): Project[] | undefined {
    return this.o.queryClient.getQueryData<Project[]>(projectsKey(spaceId));
  }

  /** Make a project with the next free colour (or the one given). Returns its id. */
  createProject(spaceId: string, name: string, color?: string): string {
    const id = this.o.newId?.() ?? crypto.randomUUID();
    const taken = (this.cachedProjects(spaceId) ?? []).map((p) => p.color);
    this.mutate({
      type: 'project.create',
      payload: { id, spaceId, name: name.trim(), color: color ?? nextProjectColor(taken) },
    });
    return id;
  }

  updateProject(
    spaceId: string,
    id: string,
    patch: { name?: string; color?: string; position?: number },
  ): void {
    this.mutate({ type: 'project.update', payload: { id, spaceId, ...patch } });
  }

  deleteProject(spaceId: string, id: string): void {
    const project = this.cachedProjects(spaceId)?.find((p) => p.id === id);
    if (project) {
      const tasks = new Set<string>();
      for (const [, data] of this.o.queryClient.getQueriesData<DayData>({ queryKey: ['day', spaceId] }))
        for (const t of data?.tasks ?? []) if (t.projectId === id) tasks.add(t.id);
      this.deletedProjects.set(id, { project, tasks });
    }
    this.mutate({ type: 'project.delete', payload: { id, spaceId } });
  }

  /** Undo a delete: the project is back, on the tasks it was taken off. */
  restoreProject(spaceId: string, id: string): void {
    this.mutate({ type: 'project.restore', payload: { id, spaceId } });
  }

  // ---- you and the space -----------------------------------------------------------------------------------

  /** Your name, as everyone sees it. Saves through the outbox like any change. */
  renameMe(userId: string, name: string): void {
    this.mutate({ type: 'me.rename', payload: { id: userId, name: name.trim() } });
  }

  /** A team space's name or colour (admins). The address follows a new name once the server has it. */
  updateSpace(spaceId: string, patch: { name?: string; color?: string }): void {
    this.mutate({
      type: 'space.update',
      payload: { id: spaceId, ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) },
    });
  }

  // ---- files ---------------------------------------------------------------------------------------------

  /** Upload a file into the space's storage, for a task or for one not written yet. Needs a connection. */
  async upload(
    spaceId: string,
    file: File,
    taskId: string | null,
    onProgress?: (ratio: number) => void,
  ): Promise<Attachment> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (taskId) form.append('taskId', taskId);
    try {
      const saved = await this.o.api.upload<Attachment>(`/api/spaces/${spaceId}/files`, form, onProgress);
      this.setReachable(true);
      return saved;
    } catch (err) {
      if (!(err instanceof ApiError)) this.setReachable(false);
      throw err;
    }
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
    const list = this.cached(t.spaceId, day);
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
    if (this.unanswered > 0 || this.pending.size > 0) return false;
    return (await this.outbox.idle()) && this.unanswered === 0 && this.pending.size === 0;
  }

  // ---- the live stream -----------------------------------------------------------------------------------

  /** Refresh the days and tasks another tab or device changed. Our own changes are already on screen. */
  onEvent(e: LiveEvent): void {
    if (e.type === SPACE_CHANGED) {
      void this.o.queryClient.invalidateQueries({ queryKey: ['me'] });
      return;
    }
    if (e.type === SPACE_GONE) {
      void this.o.queryClient.invalidateQueries({ queryKey: ['me'] });
      this.o.onSpaceGone?.(e.data as SpaceGoneEvent);
      return;
    }
    if (e.type === INBOX_CHANGED) {
      // One Inbox across every space: whatever changed, read it again.
      void (e.data as InboxChangedEvent);
      void this.o.queryClient.invalidateQueries({ queryKey: ['inbox'] });
      void this.o.queryClient.invalidateQueries({ queryKey: ['me'] });
      return;
    }
    if (e.type === MEMBERS_CHANGED) {
      const me = e.data as MembersChangedEvent;
      void this.o.queryClient.invalidateQueries({ queryKey: ['me'] });
      void this.o.queryClient.invalidateQueries({ queryKey: membersKey(me.spaceId), exact: true });
      void this.o.queryClient.invalidateQueries({ queryKey: ['people', me.spaceId] });
      return;
    }
    if (e.type === JIRA_CHANGED) {
      const je = e.data as JiraChangedEvent;
      void this.o.queryClient.invalidateQueries({ queryKey: ['jira', je.spaceId, 'connection'] });
      return;
    }
    if (e.type === PROJECTS_CHANGED) {
      const pe = e.data as ProjectsChangedEvent;
      if (pe.clientId && pe.clientId === this.clientId) return;
      void this.o.queryClient.invalidateQueries({ queryKey: projectsKey(pe.spaceId), exact: true });
      return;
    }
    if (e.type !== TASKS_CHANGED) return;
    const ev = e.data as TasksChangedEvent;
    if (ev.clientId && ev.clientId === this.clientId) return;
    const qc = this.o.queryClient;
    for (const d of ev.days) void qc.invalidateQueries({ queryKey: dayKey(ev.spaceId, d), exact: true });
    for (const t of ev.tasks ?? [])
      void qc.invalidateQueries({ queryKey: taskKey(ev.spaceId, t), exact: true });
    void qc.invalidateQueries({ queryKey: ['marks', ev.spaceId] });
    // People shows everyone's tasks: a colleague's change refreshes it.
    void qc.invalidateQueries({ queryKey: ['people', ev.spaceId] });
    void qc.invalidateQueries({ queryKey: jiraLinksKey(ev.spaceId), exact: true });
  }

  /** After the stream was down for a while: read every cached day and task again. */
  refreshAll(): void {
    void this.o.queryClient.invalidateQueries({ queryKey: ['day'] });
    void this.o.queryClient.invalidateQueries({ queryKey: ['task'] });
    void this.o.queryClient.invalidateQueries({ queryKey: ['projects'] });
    void this.o.queryClient.invalidateQueries({ queryKey: ['marks'] });
    void this.o.queryClient.invalidateQueries({ queryKey: ['people'] });
    void this.o.queryClient.invalidateQueries({ queryKey: ['members'] });
    void this.o.queryClient.invalidateQueries({ queryKey: ['inbox'] });
    void this.o.queryClient.invalidateQueries({
      queryKey: ['jira'],
      predicate: (q) => q.queryKey[2] === 'links',
    });
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
    this.unanswered = 0;
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
    this.unanswered += 1;
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
    if (isSettingsMutation(m)) {
      const me = qc.getQueryData<MeResponse>(['me']);
      if (me) qc.setQueryData<MeResponse>(['me'], applyToMe(me, m));
      return;
    }
    // Your first task ticks Getting started, however it was written.
    if (m.type === 'task.create') tickGettingStarted(qc, 'task');
    if (m.type === 'project.restore') {
      const kept = this.deletedProjects.get(m.payload.id);
      if (!kept) return;
      this.deletedProjects.delete(m.payload.id);
      const key = projectsKey(m.payload.spaceId);
      const list = qc.getQueryData<Project[]>(key);
      if (list && !list.some((p) => p.id === kept.project.id))
        qc.setQueryData<Project[]>(
          key,
          [...list, kept.project].sort(
            (a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt),
          ),
        );
      for (const [k, data] of qc.getQueriesData<DayData>({ queryKey: ['day', m.payload.spaceId] })) {
        if (!data?.tasks.some((t) => kept.tasks.has(t.id) && t.projectId === null)) continue;
        const tasks = data.tasks.map((t) =>
          kept.tasks.has(t.id) && t.projectId === null ? { ...t, projectId: kept.project.id } : t,
        );
        this.remember(tasks);
        qc.setQueryData<DayData>(k, { ...data, tasks });
      }
      return;
    }
    if (isProjectMutation(m)) {
      const key = projectsKey(m.payload.spaceId);
      const list = qc.getQueryData<Project[]>(key);
      if (list) qc.setQueryData<Project[]>(key, applyToProjects(list, m.payload.spaceId, m));
      if (m.type !== 'project.delete') return;
    }
    const id = taskIdOf(m);
    // Which issues have tasks: the panel's chips follow every change of yours at once.
    for (const [key, data] of qc.getQueriesData<JiraLinksResponse>({ queryKey: ['jira'] })) {
      if (!data || key[2] !== 'links') continue;
      const next = applyToLinks(data.links, key[1] as string, m, (x) => this.known.get(x));
      if (next !== data.links) qc.setQueryData<JiraLinksResponse>(key, { links: next });
    }
    // The task's detail first, so a day row can take its exact counts from it.
    for (const [key, data] of qc.getQueriesData<TaskDetail>({ queryKey: ['task'] })) {
      if (!data || (!isProjectMutation(m) && data.id !== id)) continue;
      const next = applyToDetail(data, m, this.o.me?.() ?? null);
      if (next !== data) qc.setQueryData<TaskDetail>(key, next);
    }
    const detail = [...qc.getQueriesData<TaskDetail>({ queryKey: ['task'] })].find(
      ([, d]) => d?.id === id,
    )?.[1];
    for (const [key, data] of qc.getQueriesData<DayData>({ queryKey: ['day'] })) {
      if (!data) continue;
      const [, spaceId, day] = key as unknown as [string, string, IsoDate | null];
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
  private overlay(spaceId: string, day: IsoDate | null, rows: Task[]): Task[] {
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
    const list = this.cached(spaceId, day);
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
    for (const r of res.results) {
      if (this.pending.delete(r.id)) this.unanswered = Math.max(0, this.unanswered - 1);
    }
    this.merge(res);
    const touched = new Set<string>();
    for (const b of batch)
      if (!isProjectMutation(b as SyncMutation) && !isSettingsMutation(b as SyncMutation))
        touched.add(taskIdOf(b as SyncMutation));
    if (rejected.length) {
      // Undo by reading the days again: the server's rows plus whatever is still on its way.
      void this.o.queryClient.invalidateQueries({ queryKey: ['day'] });
      void this.o.queryClient.invalidateQueries({ queryKey: ['task'] });
      void this.o.queryClient.invalidateQueries({ queryKey: ['projects'] });
      this.o.onRejected?.(rejected[0]!.error ?? 'That change couldn’t be saved.');
    } else {
      // The detail of each task touched reads again, so server-made facts (history, numbers) arrive.
      for (const [key, d] of this.o.queryClient.getQueriesData<TaskDetail>({ queryKey: ['task'] }))
        if (d && touched.has(d.id)) void this.o.queryClient.invalidateQueries({ queryKey: key, exact: true });
    }
    void this.o.queryClient.invalidateQueries({ queryKey: ['marks'] });
    void this.o.queryClient.invalidateQueries({ queryKey: ['people'] });
    // The server's word on which issues have tasks (and the numbers of new ones).
    if (batch.some((b) => (b as SyncMutation).type.startsWith('task.')))
      void this.o.queryClient.invalidateQueries({
        queryKey: ['jira'],
        predicate: (q) => q.queryKey[2] === 'links',
      });
    // Anything about requests or the Inbox: read the Inbox and the counts again, now the server has the truth.
    // You or a space changed: /api/me (names, addresses), the members and People read again.
    if (batch.some((b) => isSettingsMutation(b as SyncMutation))) {
      void this.o.queryClient.invalidateQueries({ queryKey: ['me'] });
      void this.o.queryClient.invalidateQueries({ queryKey: ['members'] });
    }
    if (batch.some((b) => (b as SyncMutation).type === 'project.restore')) {
      void this.o.queryClient.invalidateQueries({ queryKey: ['projects'] });
      void this.o.queryClient.invalidateQueries({ queryKey: ['day'] });
    }
    if (batch.some((b) => isInboxMutation(b as SyncMutation))) {
      void this.o.queryClient.invalidateQueries({ queryKey: ['inbox'] });
      void this.o.queryClient.invalidateQueries({ queryKey: ['me'] });
    }
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
      const [, spaceId, day] = key as unknown as [string, string, IsoDate | null];
      let tasks = data.tasks.filter((t) => !rows.has(t.id) && !gone.has(t.id));
      for (const t of rows.values()) if (t.spaceId === spaceId && t.day === day) tasks.push(t);
      for (const { m } of this.pending.values())
        if (!isProjectMutation(m) && !isSettingsMutation(m) && rows.has(taskIdOf(m)))
          tasks = applyToDay(tasks, day, spaceId, m, (id) => this.known.get(id));
      tasks.sort(byPosition);
      if (!sameTasks(tasks, data.tasks)) qc.setQueryData<DayData>(key, { day, tasks });
    }
  }

  /**
   * Everything on disk was sent (by this tab or another): forget what we were holding for it. A change written
   * to disk after the outbox last looked is still on its way, so only what is no longer on disk goes.
   */
  private async sweep(): Promise<void> {
    // Only what was on disk before this look can be gone from it: a change that lands while the read is in flight
    // may be missing from the answer yet still on its way, so it is left for the next sweep.
    const candidates = [...this.pending].filter(([, p]) => p.stored).map(([id]) => id);
    const left = new Set((await this.o.store.all()).map((m) => m.id));
    for (const id of candidates)
      if (this.pending.has(id) && !left.has(id)) {
        this.pending.delete(id);
        this.unanswered = Math.max(0, this.unanswered - 1);
      }
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
