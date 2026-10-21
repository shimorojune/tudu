import { useQuery } from '@tanstack/react-query';
import {
  issueUrl,
  jiraCount,
  JIRA_ASSIGNED_VIEW,
  siteHost,
  type JiraConnectionResponse,
  type JiraLink,
} from '@tudu/core';
import { JiraClient, jiraConnectionKey } from '@tudu/client';
import { useSyncExternalStore } from 'react';
import { api, queryClient } from './session';

/** Jira, through the API. Every read is online and asked only while you look. */
export const jiraClient = new JiraClient(api, queryClient);

/** The count is asked with the shell and again this often while the app is open. */
export const JIRA_COUNT_EVERY_MS = 15 * 60 * 1000;
/** The list is asked again when it is older than this and the panel is in view. */
export const JIRA_STALE_MS = 5 * 60 * 1000;

export type Connected = Extract<JiraConnectionResponse, { connected: true }>;

/**
 * Your Jira in this space, as the shell needs it: connected or not, the site, and the count of issues assigned
 * to you with no open task here. The count follows your own changes at once (the links read is Tudu's own).
 */
export function useJira(spaceId: string): {
  conn: Connected | null;
  /** Read at least once: until then nothing about Jira shows. */
  known: boolean;
  links: JiraLink[];
  count: number | null;
} {
  const c = useQuery({
    ...jiraClient.connectionQuery(spaceId),
    refetchInterval: JIRA_COUNT_EVERY_MS,
    staleTime: JIRA_COUNT_EVERY_MS,
  });
  const conn = c.data?.connected ? c.data : null;
  const links = useQuery({ ...jiraClient.linksQuery(spaceId), enabled: !!conn }).data?.links ?? [];
  const count = conn?.assigned ? jiraCount(conn.assigned, links) : null;
  return { conn, known: c.isFetched, links, count };
}

/** Open an issue's page in Jira, in a new tab, when Jira is connected in this space; otherwise nothing. */
export function openInJira(spaceId: string, key: string): boolean {
  const c = queryClient.getQueryData<JiraConnectionResponse>(jiraConnectionKey(spaceId));
  if (!c?.connected) return false;
  window.open(issueUrl(c.site, key), '_blank', 'noopener,noreferrer');
  return true;
}

export const hostOf = (c: Connected | null) => (c ? siteHost(c.site) : undefined);

// ---- per browser: the view you were on and a draft JQL, per space ----------------------------------------------

const VIEW_KEY = 'tudu.jira.view';
export interface JiraPick {
  /** `assigned`, a saved view's id, or `custom`. */
  view: string;
  /** The custom JQL, while the view is custom. */
  jql?: string;
}

function readPicks(): Record<string, JiraPick> {
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as Record<string, JiraPick>;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

let picks = readPicks();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const notify = () => listeners.forEach((l) => l());
const ASSIGNED: JiraPick = { view: JIRA_ASSIGNED_VIEW };

export function setJiraPick(spaceId: string, pick: JiraPick): void {
  picks = { ...picks, [spaceId]: pick };
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(picks));
  } catch {
    /* fine: it lasts for this visit */
  }
  notify();
}

export function useJiraPick(spaceId: string): JiraPick {
  return useSyncExternalStore(
    subscribe,
    () => picks[spaceId] ?? ASSIGNED,
    () => ASSIGNED,
  );
}

// ---- the Apps panel (desk and tablets), and where the Jira panel was opened from ------------------------------

let apps = false;
/** The panel's form was reached from Apps: it gets "‹ Apps" back. */
let fromApps = false;
/** Jira was connected a moment ago here: it fades into the sidebar, the top bar and the tabs. */
let fresh = false;
let freshTimer: ReturnType<typeof setTimeout> | null = null;

export function openApps(): void {
  if (apps) return;
  apps = true;
  notify();
}
export function closeApps(): void {
  if (!apps) return;
  apps = false;
  notify();
}
export function useAppsOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => apps,
    () => false,
  );
}

export function setFromApps(on: boolean): void {
  if (fromApps === on) return;
  fromApps = on;
  notify();
}
export function useFromApps(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => fromApps,
    () => false,
  );
}

export function markJiraFresh(): void {
  fresh = true;
  notify();
  if (freshTimer) clearTimeout(freshTimer);
  freshTimer = setTimeout(() => {
    fresh = false;
    notify();
  }, 1600);
}
export function useJiraFresh(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => fresh,
    () => false,
  );
}

/** For tests. */
export function resetJiraForTests(): void {
  apps = false;
  fromApps = false;
  fresh = false;
  picks = {};
  try {
    localStorage.removeItem(VIEW_KEY);
  } catch {
    /* fine */
  }
  notify();
}

// ---- the address ---------------------------------------------------------------------------------------------

/**
 * Where the panel is: `?jira` on the page you are on (desk and tablets), `?jira=KEY` with an issue open. Null when
 * it is closed.
 */
export function jiraParam(searchStr: string): { open: boolean; issue: string | null } {
  const q = new URLSearchParams(searchStr);
  if (!q.has('jira')) return { open: false, issue: null };
  const v = q.get('jira');
  return { open: true, issue: v ? v.toUpperCase() : null };
}

/** The same address with the panel opened (on an issue, or on the list), or closed for `false`. */
export function withJira(at: { pathname: string; searchStr: string }, jira: string | null | false): string {
  const q = new URLSearchParams(at.searchStr);
  if (jira === false) q.delete('jira');
  else q.set('jira', jira ?? '');
  const s = q.toString().replace(/(^|&)jira=(&|$)/, '$1jira$2');
  return `${at.pathname}${s ? `?${s}` : ''}`;
}
