import { addDays, diffDays, formatDay, type IsoDate } from './dates';

/** One task as a search result: enough for its row and for going to it. */
export interface SearchHit {
  id: string;
  ref: string;
  title: string;
  /** The day it is on; null is the Backlog. */
  day: IsoDate | null;
  done: boolean;
  projectId: string | null;
  /** The Jira key it is linked to, shown with the mark in the byline. */
  jira: string | null;
  /** A line of the note around the matched word, when the match is there and nowhere in the title. */
  snippet: string | null;
}

export interface SearchResponse {
  hits: SearchHit[];
}

/** What the ranking reads of a task. `notes` is plain text, never markup. */
export interface Searchable {
  ref: string;
  title: string;
  day: IsoDate | null;
  done: boolean;
  notes?: string | null;
  /** The linked Jira key: typed in full it is the top hit, and its parts match as words. */
  jira?: string | null;
}

/** The words you type, split on spaces. Every word has to be found somewhere in the task. */
export function searchTokens(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

/** A task ID (or a Jira key) typed in full, "ME-52": a lookup, not a topic. */
export function isRefLike(q: string): boolean {
  return /^[a-z][a-z0-9]*-\d+$/i.test(q.trim());
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The most a word match can score; a task ID typed in full. */
export const SCORE_REF = 100;

/**
 * How well a task matches: the task ID or Jira key typed in full beats everything, then a title that starts with
 * the words, then titles with every word at the start of a word, then anywhere in the title, then the ID or the
 * Jira key, then the note.
 * Crossed-off tasks sit a step below open ones with the same match. Null when a word is found nowhere.
 */
export function matchScore(
  it: Pick<Searchable, 'ref' | 'title' | 'notes' | 'done' | 'jira'>,
  q: string,
): { score: number; inNotes: boolean } | null {
  const ql = q.trim().toLowerCase();
  if (!ql) return null;
  const toks = searchTokens(ql);
  const t = it.title.toLowerCase();
  const id = it.ref.toLowerCase();
  const nt = (it.notes ?? '').toLowerCase();
  const jr = (it.jira ?? '').toLowerCase();
  if (id === ql || (jr && jr === ql)) return { score: SCORE_REF, inNotes: false };
  const hay = `${t} ${id} ${jr} ${nt}`;
  for (const k of toks) if (!hay.includes(k)) return null;
  const inTitle = toks.every((k) => t.includes(k));
  let s: number;
  if (inTitle) {
    if (t.startsWith(ql)) s = 70;
    else {
      const starts = toks.every((k) => new RegExp(`(^|[^a-z0-9])${escapeRe(k)}`).test(t));
      s = (starts ? 50 : 34) + (t.includes(ql) ? 8 : 0);
    }
  } else if (toks.every((k) => t.includes(k) || id.includes(k) || jr.includes(k))) s = 40;
  else s = 16;
  if (it.done) s -= 6;
  return { score: s, inNotes: !inTitle && s === 16 };
}

/**
 * Where a task sits when two match alike: today first, then the days ahead (nearest first), the Backlog, the days
 * behind (nearest first), then the crossed-off ones in the same order with the Backlog's last. Lower comes first.
 */
export function whereRank(day: IsoDate | null, done: boolean, today: IsoDate): number {
  if (done) {
    if (day === null) return 6_000_000;
    const n = diffDays(today, day);
    return n >= 0 ? 4_000_000 + n : 5_000_000 - n;
  }
  if (day === null) return 2_000_000;
  const n = diffDays(today, day);
  if (n === 0) return 0;
  return n > 0 ? 1_000_000 + n : 3_000_000 - n;
}

/** A line of the note around the first word that matched. */
export function snippetOf(text: string, q: string): string {
  const toks = searchTokens(q.trim().toLowerCase());
  const t = text.replace(/\s+/g, ' ').trim();
  const lo = t.toLowerCase();
  let at = -1;
  for (const k of toks) {
    const i = lo.indexOf(k);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return t.slice(0, 90);
  let start = Math.max(0, at - 30);
  if (start > 0) {
    const sp = t.indexOf(' ', start);
    if (sp > 0 && sp < at) start = sp + 1;
  }
  return (start > 0 ? '…' : '') + t.slice(start, start + 96) + (start + 96 < t.length ? '…' : '');
}

export interface Ranked<T> {
  item: T;
  score: number;
  snippet: string | null;
}

/**
 * The best matches for the words, best first: by the match, then by where the task sits against today, then the
 * order the tasks came in. At most `limit`.
 */
export function rankSearch<T extends Searchable>(
  items: T[],
  q: string,
  today: IsoDate,
  limit = 30,
): Ranked<T>[] {
  const out: Array<Ranked<T> & { where: number; i: number }> = [];
  items.forEach((item, i) => {
    const r = matchScore(item, q);
    if (!r) return;
    out.push({
      item,
      score: r.score,
      snippet: r.inNotes && item.notes ? snippetOf(item.notes, q) : null,
      where: whereRank(item.day, item.done, today),
      i,
    });
  });
  out.sort((a, b) => b.score - a.score || a.where - b.where || a.i - b.i);
  return out.slice(0, limit).map(({ item, score, snippet }) => ({ item, score, snippet }));
}

/** Where a hit lives, in the row's byline: "Today" (in the brand tone), "Tomorrow", "Fri 23 Oct", "Backlog", with "· crossed off". */
export function searchWhere(
  day: IsoDate | null,
  done: boolean,
  today: IsoDate,
): { label: string; tone: 'today' | null } {
  let label: string;
  if (day === null) label = 'Backlog';
  else if (day === today) label = 'Today';
  else if (day === addDays(today, 1)) label = 'Tomorrow';
  else if (day === addDays(today, -1)) label = 'Yesterday';
  else label = formatDay(day);
  if (done) label += ' · crossed off';
  return { label, tone: day === today && !done ? 'today' : null };
}

const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'for',
  'to',
  'of',
  'on',
  'in',
  'my',
  'with',
  'about',
  'after',
  'before',
  'new',
  'old',
]);

/** The words of a title that carry meaning: lower case, three letters or more, no small words. */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Quick Add needs this many letters before it looks for tasks like the title. */
export const LOOKALIKE_MIN = 4;

/**
 * Does a title read like tasks you already have? Open tasks that share two or more of its words (one is enough for
 * a title of one or two words), the closest first, at most three. A shared word may be the same word or share its
 * first five letters ("interview", "interviews").
 */
export function lookAlikes<T extends { title: string; done: boolean }>(items: T[], title: string): T[] {
  if (title.trim().length < LOOKALIKE_MIN) return [];
  const tw = wordsOf(title);
  if (!tw.length) return [];
  const same = (w: string, x: string) => x === w || (w.length > 4 && x.startsWith(w.slice(0, 5)));
  const out: Array<{ s: number; i: number; it: T }> = [];
  items.forEach((it, i) => {
    if (it.done) return;
    const iw = wordsOf(it.title);
    const shared = tw.filter((w) => iw.some((x) => same(w, x))).length;
    const score = shared / Math.max(2, Math.min(tw.length, iw.length));
    if ((shared >= 2 || (shared === 1 && tw.length <= 2)) && score >= 0.5) out.push({ s: score, i, it });
  });
  return out
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.it);
}
