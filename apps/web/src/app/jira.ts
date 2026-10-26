import { useQuery } from '@tanstack/react-query';
import {
  issueUrl,
  jiraCount,
  JIRA_ASSIGNED_VIEW,
  siteHost,
  type ConnectorSpacesResponse,
  type JiraConnectionResponse,
  type JiraLink,
} from '@tudu/core';
import { JiraClient, jiraConnectionKey, jiraSpacesKey } from '@tudu/client';
import { showToast } from '@tudu/ui';
import { useSyncExternalStore } from 'react';
import { openOutside } from './links';
import { api, queryClient } from './session';

/** Jira, through the API. Every read is online and asked only while you look. */
export const jiraClient = new JiraClient(api, queryClient);

/** The count is asked with the shell and again this often while the app is open. */
export const JIRA_COUNT_EVERY_MS = 15 * 60 * 1000;
/** The list is asked again when it is older than this and the panel is in view. */
export const JIRA_STALE_MS = 5 * 60 * 1000;

export type Connected = Extract<JiraConnectionResponse, { connected: true }>;

/**
 * Your Jira as a space's shell needs it. You connect once, for your account, and turn it on per space: `conn` is
 * set only where it is on, so a space where it is off shows no Jira at all. The count is of issues assigned to you
 * with no open task in any space, and follows your own changes at once (the links read is Tudu's own).
 */
export function useJira(spaceId: string): {
  conn: Connected | null;
  /** Connected for your account, on here or not. */
  connected: Connected | null;
  /** Read at least once: until then nothing about Jira shows. */
  known: boolean;
  /** On in this space (false until the switches are read). */
  onHere: boolean;
  links: JiraLink[];
  count: number | null;
} {
  const c = useQuery({
    ...jiraClient.connectionQuery(),
    refetchInterval: JIRA_COUNT_EVERY_MS,
    staleTime: JIRA_COUNT_EVERY_MS,
  });
  const connected = c.data?.connected ? c.data : null;
  const sp = useQuery({ ...jiraClient.spacesQuery(), enabled: !!connected });
  const onHere = !!connected && !!sp.data?.spaces.some((s) => s.id === spaceId && s.on);
  const conn = onHere ? connected : null;
  const links = useQuery({ ...jiraClient.linksQuery(), enabled: !!connected }).data?.links ?? [];
  const count = conn?.assigned ? jiraCount(conn.assigned, links) : null;
  return { conn, connected, known: c.isFetched && (!connected || sp.isFetched), onHere, links, count };
}

/** Jira is on in this space, as far as this tab has read. */
export function jiraOnIn(spaceId: string): boolean {
  const c = queryClient.getQueryData<JiraConnectionResponse>(jiraConnectionKey());
  const sp = queryClient.getQueryData<ConnectorSpacesResponse>(jiraSpacesKey());
  return !!c?.connected && !!sp?.spaces.some((s) => s.id === spaceId && s.on);
}

/**
 * Open an issue's page in Jira (a new tab; in the macOS app, the default browser) when Jira is on in this space;
 * otherwise nothing.
 */
export function openInJira(spaceId: string, key: string): boolean {
  const c = queryClient.getQueryData<JiraConnectionResponse>(jiraConnectionKey());
  if (!c?.connected || !jiraOnIn(spaceId)) return false;
  openOutside(issueUrl(c.site, key));
  return true;
}

export const hostOf = (c: Connected | null) => (c ? siteHost(c.site) : undefined);

// ---- per browser: the view you were on and a draft JQL --------------------------------------------------------

const VIEW_KEY = 'tudu.jira.view';
export interface JiraPick {
  /** `assigned`, a saved view's id, or `custom`. */
  view: string;
  /** The custom JQL, while the view is custom. */
  jql?: string;
}
const isPick = (x: unknown): x is JiraPick =>
  !!x && typeof x === 'object' && typeof (x as JiraPick).view === 'string';

/**
 * One pick, as the views are your account's. Before, it was kept per space ({spaceId: pick}): the first space's
 * pick carries over, once.
 */
function readPicks(): JiraPick | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
    if (isPick(raw)) return raw;
    if (!raw || typeof raw !== 'object') return null;
    const old = Object.values(raw).find(isPick) ?? null;
    if (old) localStorage.setItem(VIEW_KEY, JSON.stringify(old));
    else localStorage.removeItem(VIEW_KEY);
    return old;
  } catch {
    return null;
  }
}

let pick = readPicks();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const notify = () => listeners.forEach((l) => l());
const ASSIGNED: JiraPick = { view: JIRA_ASSIGNED_VIEW };

export function setJiraPick(next: JiraPick): void {
  pick = next;
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(next));
  } catch {
    /* fine: it lasts for this visit */
  }
  notify();
}

export function useJiraPick(): JiraPick {
  return useSyncExternalStore(
    subscribe,
    () => pick ?? ASSIGNED,
    () => ASSIGNED,
  );
}

// ---- the Apps panel (desk and tablets), and where the Jira panel was opened from ------------------------------

let apps = false;
/** Settings › Apps asked for a new token: the panel opens on the reconnect form. */
let reconnect = false;

export function askJiraReconnect(): void {
  reconnect = true;
}
/** Read once by the panel as it opens. */
export function takeJiraReconnect(): boolean {
  const r = reconnect;
  reconnect = false;
  return r;
}
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

// ---- Manage spaces… from a space: that space's row in Settings › Apps glows once ------------------------------

let glow: string | null = null;
/** Settings › Apps is about to open from this space's Jira panel: its row glows when the list first draws. */
export function glowJiraSpace(spaceId: string): void {
  glow = spaceId;
}
/** The row to glow, if any (read while Settings mounts; cleared once it has). */
export const peekJiraGlow = (): string | null => glow;
export function clearJiraGlow(): void {
  glow = null;
}

/**
 * Turn Jira off in one space and keep it everywhere else: the switch flips on screen at once (Jira leaves the top
 * bar and sidebar), the toast offers Undo. Resolves true once the server agrees; on a refusal the switch is back on
 * and, unless `quiet`, a toast offers Try again.
 */
export async function turnOffHere(
  space: { id: string; name: string },
  opts: { quiet?: boolean } = {},
): Promise<boolean> {
  try {
    await jiraClient.setOn(space.id, false);
  } catch {
    if (!opts.quiet)
      showToast('Couldn’t turn Jira off here.', {
        action: 'Try again',
        onAction: () => void turnOffHere(space),
      });
    return false;
  }
  showToast(`Jira is off in ${space.name}.`, {
    action: 'Undo',
    onAction: () =>
      void jiraClient.setOn(space.id, true).then(markJiraFresh, () =>
        showToast('Couldn’t turn Jira back on. Try again from Settings › Apps.'),
      ),
  });
  return true;
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

/** For tests: read the stored pick again, as a new visit would. */
export function reloadJiraPickForTests(): void {
  pick = readPicks();
  notify();
}

/** For tests. */
export function resetJiraForTests(): void {
  apps = false;
  reconnect = false;
  fromApps = false;
  fresh = false;
  pick = null;
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
