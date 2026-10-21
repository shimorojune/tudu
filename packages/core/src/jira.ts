import {
  addDays,
  diffDays,
  formatDay,
  MONTHS_SHORT,
  partsOf,
  WEEKDAYS_SHORT,
  weekdayOf,
  type IsoDate,
} from './dates';
import { dueLabel } from './due';

/** A Jira issue key as Jira writes it: the project's key, a dash, the number ("TUDU-212"). */
export const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/;
export const JIRA_KEY_MAX = 64;

/** The key in a person's words, uppercased ("tudu-212 " is TUDU-212), or null when it is not a key. */
export function parseJiraKey(text: string): string | null {
  const k = text.trim().toUpperCase();
  return k.length <= JIRA_KEY_MAX && JIRA_KEY_PATTERN.test(k) ? k : null;
}

/** The Views menu's first view: your open issues, the newest change first. */
export const JIRA_ASSIGNED_JQL = 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC';
export const JIRA_ASSIGNED_VIEW = 'assigned';
export const JIRA_VIEW_NAME_MAX = 60;
export const JIRA_JQL_MAX = 2000;
/** At most this many issues in one list (Jira's own page). */
export const JIRA_PAGE = 50;

/** One issue in the list: only what every Jira has. */
export interface JiraIssue {
  key: string;
  summary: string;
  /** The status's name as that Jira calls it ("In review"). */
  status: string;
  due: IsoDate | null;
  /** When it last changed in Jira (an instant). */
  updated: string | null;
}

export interface JiraComment {
  id: string;
  who: string;
  at: string;
  /** Jira's rendered HTML, cleaned as notes are. */
  html: string;
}

/** One issue in full, for the preview. */
export interface JiraIssueDetail extends JiraIssue {
  issuetype: string | null;
  assignee: string | null;
  priority: string | null;
  /** Cleaned HTML, empty when there is none. */
  description: string;
  /** The last comments, oldest first; `commentTotal` is how many Jira has. */
  comments: JiraComment[];
  commentTotal: number;
}

/** A task of yours linked to an issue, from Tudu's own database. */
export interface JiraLink {
  key: string;
  taskId: string;
  ref: string | null;
  title: string;
  day: IsoDate | null;
  done: boolean;
}

export interface JiraView {
  id: string;
  name: string;
  jql: string;
}

export type JiraState = 'ok' | 'expired';

/** Your Jira in a space, as the shell reads it. */
export type JiraConnectionResponse =
  | { connected: false }
  | {
      connected: true;
      /** "https://jira.northwind.io" */
      site: string;
      who: { name: string; email: string };
      state: JiraState;
      syncedAt: string | null;
      views: JiraView[];
      /** The keys of the issues assigned to you (the first page); null when Jira did not answer. */
      assigned: string[] | null;
      /** Of those, the ones with no open task of yours in this space. */
      count: number | null;
    };

export interface JiraIssuesResponse {
  issues: JiraIssue[];
  /** How many Jira has for the query (the list holds at most a page). */
  total: number;
  syncedAt: string;
}

export interface JiraLinksResponse {
  links: JiraLink[];
}

/** Why Jira said no, so the panel can put the words where they belong. */
export type JiraErrorCode =
  | 'not-address'
  | 'private-address'
  | 'unreachable'
  | 'token-refused'
  | 'no-read'
  | 'expired'
  | 'jql'
  | 'not-found'
  | 'not-connected'
  | 'name-taken';

export interface JiraErrorBody {
  error: string;
  code: JiraErrorCode;
  /** The connect form's field the words belong under. */
  field?: 'site' | 'token';
}

/** The live event: your Jira in a space changed (connected, disconnected, a view saved). */
export const JIRA_CHANGED = 'jira.changed';
export interface JiraChangedEvent {
  spaceId: string;
}

/** The address as a person types it, checked before anything is sent. Null when it is fine. */
export function siteProblem(site: string): string | null {
  const u = site.trim();
  if (!u) return 'Add your Jira address, like https://jira.yourcompany.com.';
  if (!/^https?:\/\/[^\s/.:]+[.:]\S+$/i.test(u))
    return 'That doesn’t look like a web address. It starts with https://';
  return null;
}

/** The address kept: no trailing slash, no query. */
export function normalSite(site: string): string {
  return site
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

/** "jira.northwind.io", for the header and Settings. */
export function siteHost(site: string): string {
  return site.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/** The issue's page in Jira. */
export function issueUrl(site: string, key: string): string {
  return `${normalSite(site)}/browse/${encodeURIComponent(key)}`;
}

/** The count's words: on the top bar's button, the sidebar and the phone tab. */
export function jiraCountWords(n: number): string {
  return `${n} assigned to you, not in Tudu yet`;
}

/** The byline's due words: "Due today", "Due Thu", "Due 4 Nov", "Overdue since Mon". */
export function jiraDueWords(due: IsoDate, today: IsoDate): { text: string; overdue: boolean } {
  if (due === today) return { text: 'Due today', overdue: false };
  const l = dueLabel(due, today);
  return l.overdue
    ? { text: `Overdue since ${l.label}`, overdue: true }
    : { text: `Due ${l.label}`, overdue: false };
}

/** Where a linked task sits, short, for the chip: "Today", "Tomorrow", "Thu", "24 Oct", "Backlog". */
export function linkDayShort(day: IsoDate | null, today: IsoDate): string {
  if (!day) return 'Backlog';
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  const n = diffDays(today, day);
  if (n > 0 && n < 7) return WEEKDAYS_SHORT[weekdayOf(day)]!;
  const { month, day: d } = partsOf(day);
  return `${d} ${MONTHS_SHORT[month - 1]}`;
}

/** Where a linked task sits, in a sentence: "Today", "Tomorrow", "Thu 23 Oct", "the Backlog". */
export function linkDayLong(day: IsoDate | null, today: IsoDate): string {
  if (!day) return 'the Backlog';
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  return formatDay(day);
}

/** The chip's words: "ME-52 · Today"; its name for a screen reader. */
export function linkChipWords(
  l: Pick<JiraLink, 'ref' | 'day' | 'done'>,
  today: IsoDate,
): { text: string; label: string } {
  const day = linkDayShort(l.day, today);
  const where = l.day ? ` on ${linkDayLong(l.day, today)}` : ' in the Backlog';
  return {
    text: l.ref ? `${l.ref} · ${day}` : day,
    label: `Show the linked task${l.ref ? ` ${l.ref}` : ''}${where}${l.done ? ', crossed off' : ''}`,
  };
}

/** The preview's foot, beside the linked task. */
export function linkFootWords(l: Pick<JiraLink, 'day' | 'done'>, today: IsoDate): string {
  if (l.done) return 'Its Tudu task is done.';
  if (!l.day) return 'This issue already has a Tudu task, in the Backlog.';
  return `This issue already has a Tudu task, on ${linkDayLong(l.day, today)}.`;
}

/** "Synced just now", "Synced 12 min ago": the header's time of Jira's last answer. */
export function syncedWords(at: string | null, now: Date): string | null {
  if (!at) return null;
  const ms = Math.max(0, now.getTime() - Date.parse(at));
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** How many issues the search found: "1 issue across Jira", "7 issues across Jira". */
export function acrossWords(n: number): string {
  return `${n} ${n === 1 ? 'issue' : 'issues'} across Jira`;
}

/**
 * The count: issues assigned to you, less those that already have an open task of yours. A task crossed off
 * no longer counts as having it in Tudu.
 */
export function jiraCount(assigned: string[], links: Array<Pick<JiraLink, 'key' | 'done'>>): number {
  const open = new Set(links.filter((l) => !l.done).map((l) => l.key));
  return assigned.filter((k) => !open.has(k)).length;
}

/** Links grouped by key, open ones first, for the list's chips and the preview's In Tudu. */
export function linksByKey(links: JiraLink[]): Map<string, JiraLink[]> {
  const out = new Map<string, JiraLink[]>();
  for (const l of links) out.set(l.key, [...(out.get(l.key) ?? []), l]);
  for (const [k, ls] of out)
    out.set(
      k,
      [...ls].sort((a, b) => Number(a.done) - Number(b.done)),
    );
  return out;
}
