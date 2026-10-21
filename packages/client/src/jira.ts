import type { QueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import {
  taskIdOf,
  isInboxMutation,
  isProjectMutation,
  isSettingsMutation,
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

export const jiraConnectionKey = (spaceId: string) => ['jira', spaceId, 'connection'] as const;
export const jiraIssuesKey = (spaceId: string, view: string) => ['jira', spaceId, 'issues', view] as const;
export const jiraIssueKey = (spaceId: string, key: string) => ['jira', spaceId, 'issue', key] as const;
export const jiraSearchKey = (spaceId: string, q: string) => ['jira', spaceId, 'search', q] as const;
export const jiraLinksKey = (spaceId: string) => ['jira', spaceId, 'links'] as const;

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
 * Apply one change of yours to the links read (which issues have tasks). Pure; anything that is not about a task
 * of yours leaves it as it is.
 */
export function applyToLinks(
  links: JiraLink[],
  spaceId: string,
  m: SyncMutation,
  lookup: (id: string) => Task | undefined,
): JiraLink[] {
  if (isProjectMutation(m) || isInboxMutation(m) || isSettingsMutation(m)) return links;
  const id = taskIdOf(m);
  const mine = links.find((l) => l.taskId === id);
  const map = (fn: (l: JiraLink) => JiraLink) => links.map((l) => (l.taskId === id ? fn(l) : l));
  switch (m.type) {
    case 'task.create': {
      const p = m.payload;
      if (!p.jira || p.spaceId !== spaceId || mine) return links;
      return [...links, { key: p.jira, taskId: p.id, ref: null, title: p.title, day: p.day, done: false }];
    }
    case 'task.jira': {
      const t = lookup(id);
      const rest = links.filter((l) => l.taskId !== id);
      if (!m.payload.jira) return mine ? rest : links;
      if (!mine && (!t || t.spaceId !== spaceId)) return links;
      const base = mine ?? { taskId: id, ref: t!.ref, title: t!.title, day: t!.day, done: t!.done };
      return [...rest, { ...base, key: m.payload.jira }];
    }
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
      if (mine || !t?.jira || t.spaceId !== spaceId) return links;
      return [...links, { key: t.jira, taskId: id, ref: t.ref, title: t.title, day: t.day, done: t.done }];
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

  /** Your Jira in a space: the site, who you are there, the views and the count. */
  connectionQuery(spaceId: string) {
    return queryOptions({
      queryKey: jiraConnectionKey(spaceId),
      queryFn: () => this.api.get<JiraConnectionResponse>(`/api/spaces/${spaceId}/jira`),
      networkMode: 'always',
      retry: false,
    });
  }

  /** One list: the assigned view, a saved one, or your own JQL. */
  issuesQuery(spaceId: string, ask: JiraListAsk) {
    const q = 'view' in ask ? `view=${encodeURIComponent(ask.view)}` : `jql=${encodeURIComponent(ask.jql)}`;
    return queryOptions({
      queryKey: jiraIssuesKey(spaceId, listName(ask)),
      queryFn: () => this.api.get<JiraIssuesResponse>(`/api/spaces/${spaceId}/jira/issues?${q}`),
      networkMode: 'always',
      retry: false,
    });
  }

  issueQuery(spaceId: string, key: string) {
    return queryOptions({
      queryKey: jiraIssueKey(spaceId, key),
      queryFn: () =>
        this.api.get<JiraIssueDetail>(`/api/spaces/${spaceId}/jira/issues/${encodeURIComponent(key)}`),
      networkMode: 'always',
      retry: false,
      staleTime: 60_000,
    });
  }

  searchQuery(spaceId: string, q: string) {
    return queryOptions({
      queryKey: jiraSearchKey(spaceId, q),
      queryFn: () =>
        this.api.get<JiraIssuesResponse>(`/api/spaces/${spaceId}/jira/search?q=${encodeURIComponent(q)}`),
      networkMode: 'always',
      retry: false,
      staleTime: 30_000,
    });
  }

  linksQuery(spaceId: string) {
    return queryOptions({
      queryKey: jiraLinksKey(spaceId),
      queryFn: () => this.api.get<JiraLinksResponse>(`/api/spaces/${spaceId}/jira/links`),
      networkMode: 'always',
    });
  }

  /** Connect (or reconnect after an expiry): Jira is asked who the token is before anything is kept. */
  async connect(spaceId: string, site: string, token: string): Promise<JiraConnectionResponse> {
    const res = await this.api.post<JiraConnectionResponse>(`/api/spaces/${spaceId}/jira`, { site, token });
    this.qc.setQueryData(jiraConnectionKey(spaceId), res);
    void this.qc.invalidateQueries({
      queryKey: ['jira', spaceId],
      predicate: (q) => q.queryKey[2] === 'issues',
    });
    return res;
  }

  async disconnect(spaceId: string): Promise<void> {
    await this.api.delete(`/api/spaces/${spaceId}/jira`);
    this.qc.setQueryData<JiraConnectionResponse>(jiraConnectionKey(spaceId), { connected: false });
    this.qc.removeQueries({ queryKey: ['jira', spaceId], predicate: (q) => q.queryKey[2] !== 'connection' });
  }

  async saveView(spaceId: string, name: string, jql: string): Promise<JiraView> {
    const view = await this.api.post<JiraView>(`/api/spaces/${spaceId}/jira/views`, { name, jql });
    this.patchViews(spaceId, (vs) => [...vs.filter((v) => v.id !== view.id), view]);
    return view;
  }

  async removeView(spaceId: string, id: string): Promise<void> {
    this.patchViews(spaceId, (vs) => vs.filter((v) => v.id !== id));
    await this.api.delete(`/api/spaces/${spaceId}/jira/views/${id}`);
  }

  /** Undo of a removed view: saved again with the same name and query, in its old place. */
  async restoreView(spaceId: string, view: JiraView, index: number): Promise<JiraView> {
    const back = await this.api.post<JiraView>(`/api/spaces/${spaceId}/jira/views`, {
      name: view.name,
      jql: view.jql,
      index,
    });
    this.patchViews(spaceId, (vs) => {
      const rest = vs.filter((v) => v.id !== back.id);
      rest.splice(Math.min(index, rest.length), 0, back);
      return rest;
    });
    return back;
  }

  private patchViews(spaceId: string, fn: (vs: JiraView[]) => JiraView[]): void {
    const c = this.qc.getQueryData<JiraConnectionResponse>(jiraConnectionKey(spaceId));
    if (c?.connected) this.qc.setQueryData(jiraConnectionKey(spaceId), { ...c, views: fn(c.views) });
  }
}
