import type { QueryClient } from '@tanstack/react-query';
import { tickGettingStarted } from './firstRun';
import { queryOptions } from '@tanstack/react-query';
import {
  taskIdOf,
  isInboxMutation,
  isProjectMutation,
  isSettingsMutation,
  linkKeyOf,
  type ConnectorSpacesResponse,
  type JiraConnectionResponse,
  type JiraErrorBody,
  type JiraIssueDetail,
  type JiraIssuesResponse,
  type JiraLink,
  type JiraLinksResponse,
  type JiraView,
  type SyncMutation,
  type Task,
} from '@tudu/core';
import { ApiError, type Api } from './api';

// Your connection, your switches and your links are the account's; lists and issues are read in a space.
export const jiraConnectionKey = () => ['jira', 'connection'] as const;
export const jiraSpacesKey = () => ['jira', 'spaces'] as const;
export const jiraLinksKey = () => ['jira', 'links'] as const;
export const jiraIssuesKey = (spaceId: string, view: string) => ['jira', spaceId, 'issues', view] as const;
export const jiraIssueKey = (spaceId: string, key: string) => ['jira', spaceId, 'issue', key] as const;
export const jiraSearchKey = (spaceId: string, q: string) => ['jira', spaceId, 'search', q] as const;

const BASE = '/api/connectors/jira';
const inSpace = (spaceId: string) => `/api/spaces/${spaceId}/connectors/jira`;

/** What a view is in the address of a list read: the assigned preset, a saved view, or a JQL of your own. */
export type JiraListAsk = { view: string } | { jql: string };

/** A list's cache name: `assigned`, a view's id, or `jql:` and the query. */
export function listName(ask: JiraListAsk): string {
  return 'view' in ask ? ask.view : `jql:${ask.jql}`;
}

/** Jira's no, as the server put it: the words, which kind, and the connect form's field. */
export function jiraError(err: unknown): JiraErrorBody | null {
  if (!(err instanceof ApiError)) return null;
  const b = err.body as Partial<JiraErrorBody> | null;
  if (!b || typeof b.code !== 'string') return null;
  return { error: b.error ?? err.message, code: b.code, field: b.field };
}

/**
 * Apply one change of yours to the links read (which issues have tasks, in every space you're in). Pure; anything
 * that is not about a task of yours leaves it as it is.
 */
export function applyToLinks(
  links: JiraLink[],
  m: SyncMutation,
  lookup: (id: string) => Task | undefined,
): JiraLink[] {
  if (isProjectMutation(m) || isInboxMutation(m) || isSettingsMutation(m)) return links;
  const id = taskIdOf(m);
  const mine = links.find((l) => l.taskId === id);
  const map = (fn: (l: JiraLink) => JiraLink) => links.map((l) => (l.taskId === id ? fn(l) : l));
  const relink = (key: string | null) => {
    const t = lookup(id);
    const rest = links.filter((l) => l.taskId !== id);
    if (!key) return mine ? rest : links;
    if (!mine && !t) return links;
    const base = mine ?? {
      taskId: id,
      spaceId: t!.spaceId,
      ref: t!.ref,
      title: t!.title,
      day: t!.day,
      done: t!.done,
    };
    return [...rest, { ...base, key }];
  };
  switch (m.type) {
    case 'task.create': {
      const p = m.payload;
      const key = p.link?.provider === 'jira' ? p.link.key : p.jira;
      if (!key || mine) return links;
      return [
        ...links,
        { key, taskId: p.id, spaceId: p.spaceId, ref: null, title: p.title, day: p.day, done: false },
      ];
    }
    case 'task.link':
      return m.payload.provider === 'jira' ? relink(m.payload.key) : links;
    case 'task.jira':
      return relink(m.payload.jira);
    case 'task.rename':
      return mine ? map((l) => ({ ...l, title: m.payload.title })) : links;
    case 'task.cross':
      return mine ? map((l) => ({ ...l, done: m.payload.done })) : links;
    case 'task.place':
      return mine ? map((l) => ({ ...l, day: m.payload.day })) : links;
    case 'task.delete':
      return mine ? links.filter((l) => l.taskId !== id) : links;
    case 'task.restore': {
      const t = lookup(id);
      const key = linkKeyOf(t?.links, 'jira');
      if (mine || !t || !key) return links;
      return [
        ...links,
        { key, taskId: id, spaceId: t.spaceId, ref: t.ref, title: t.title, day: t.day, done: t.done },
      ];
    }
    default:
      return links;
  }
}

/**
 * Jira, read through the API (Jira Data Center answers no browser). Every read is online: nothing here is kept on
 * disk or replayed. Which issues have tasks comes from Tudu's own database and is kept fresh by the task store.
 */
export class JiraClient {
  constructor(
    private readonly api: Api,
    private readonly qc: QueryClient,
  ) {}

  /** Your Jira, once for your account: the site, who you are there, the views, the count and where it is on. */
  connectionQuery() {
    return queryOptions({
      queryKey: jiraConnectionKey(),
      queryFn: () => this.api.get<JiraConnectionResponse>(BASE),
      networkMode: 'always',
      retry: false,
    });
  }

  /** Your spaces with your switch in each (Settings › Apps, and whether Jira is on in the space you're in). */
  spacesQuery() {
    return queryOptions({
      queryKey: jiraSpacesKey(),
      queryFn: () => this.api.get<ConnectorSpacesResponse>(`${BASE}/spaces`),
      networkMode: 'always',
      retry: false,
    });
  }

  /** One list: the assigned view, a saved one, or your own JQL. */
  issuesQuery(spaceId: string, ask: JiraListAsk) {
    const q = 'view' in ask ? `view=${encodeURIComponent(ask.view)}` : `jql=${encodeURIComponent(ask.jql)}`;
    return queryOptions({
      queryKey: jiraIssuesKey(spaceId, listName(ask)),
      queryFn: () => this.api.get<JiraIssuesResponse>(`${inSpace(spaceId)}/issues?${q}`),
      networkMode: 'always',
      retry: false,
    });
  }

  issueQuery(spaceId: string, key: string) {
    return queryOptions({
      queryKey: jiraIssueKey(spaceId, key),
      queryFn: () => this.api.get<JiraIssueDetail>(`${inSpace(spaceId)}/issues/${encodeURIComponent(key)}`),
      networkMode: 'always',
      retry: false,
      staleTime: 60_000,
    });
  }

  searchQuery(spaceId: string, q: string) {
    return queryOptions({
      queryKey: jiraSearchKey(spaceId, q),
      queryFn: () =>
        this.api.get<JiraIssuesResponse>(`${inSpace(spaceId)}/search?q=${encodeURIComponent(q)}`),
      networkMode: 'always',
      retry: false,
      staleTime: 30_000,
    });
  }

  linksQuery() {
    return queryOptions({
      queryKey: jiraLinksKey(),
      queryFn: () => this.api.get<JiraLinksResponse>(`${BASE}/links`),
      networkMode: 'always',
    });
  }

  /**
   * Connect (or reconnect after an expiry): Jira is asked who the token is before anything is kept. From a space's
   * Apps panel, `spaceId` turns it on there too.
   */
  async connect(site: string, token: string, spaceId?: string): Promise<JiraConnectionResponse> {
    const res = await this.api.post<JiraConnectionResponse>(BASE, {
      site,
      token,
      ...(spaceId ? { spaceId } : {}),
    });
    this.qc.setQueryData(jiraConnectionKey(), res);
    tickGettingStarted(this.qc, 'jira');
    void this.qc.invalidateQueries({ queryKey: jiraSpacesKey() });
    void this.qc.invalidateQueries({ queryKey: ['jira'], predicate: (q) => q.queryKey[2] === 'issues' });
    return res;
  }

  async disconnect(): Promise<void> {
    await this.api.delete(BASE);
    this.qc.setQueryData<JiraConnectionResponse>(jiraConnectionKey(), { connected: false });
    this.qc.removeQueries({
      queryKey: ['jira'],
      predicate: (q) => q.queryKey[1] !== 'connection' && q.queryKey[1] !== 'links',
    });
  }

  /** Your switch in one space, flipped at once on screen and put back if the server says no. */
  async setOn(spaceId: string, on: boolean): Promise<void> {
    const flip = (to: boolean) =>
      this.qc.setQueryData<ConnectorSpacesResponse>(jiraSpacesKey(), (r) =>
        r ? { spaces: r.spaces.map((s) => (s.id === spaceId ? { ...s, on: to } : s)) } : r,
      );
    flip(on);
    try {
      await this.api.put(inSpace(spaceId), { on });
    } catch (err) {
      flip(!on);
      throw err;
    }
    void this.qc.invalidateQueries({ queryKey: jiraConnectionKey() });
    if (!on) this.qc.removeQueries({ queryKey: ['jira', spaceId] });
  }

  async saveView(name: string, jql: string): Promise<JiraView> {
    const view = await this.api.post<JiraView>(`${BASE}/views`, { name, jql });
    this.patchViews((vs) => [...vs.filter((v) => v.id !== view.id), view]);
    return view;
  }

  async removeView(id: string): Promise<void> {
    this.patchViews((vs) => vs.filter((v) => v.id !== id));
    await this.api.delete(`${BASE}/views/${id}`);
  }

  /** Undo of a removed view: saved again with the same name and query, in its old place. */
  async restoreView(view: JiraView, index: number): Promise<JiraView> {
    const back = await this.api.post<JiraView>(`${BASE}/views`, { name: view.name, jql: view.jql, index });
    this.patchViews((vs) => {
      const rest = vs.filter((v) => v.id !== back.id);
      rest.splice(Math.min(index, rest.length), 0, back);
      return rest;
    });
    return back;
  }

  private patchViews(fn: (vs: JiraView[]) => JiraView[]): void {
    const c = this.qc.getQueryData<JiraConnectionResponse>(jiraConnectionKey());
    if (c?.connected) this.qc.setQueryData(jiraConnectionKey(), { ...c, views: fn(c.views) });
  }
}
