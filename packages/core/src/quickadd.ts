import { dayWord } from './carried';
import { formatDay, type IsoDate } from './dates';
import { weekPlannedDay } from './week';
import { isEmptyHtml, toHtml } from './notes';
import { TITLE_MAX } from './tasks';

/** The pages a new task can be written from. */
export type AppPage = 'today' | 'week' | 'backlog';

export interface LandsWords {
  /** "Lands on " or "Lands in ". */
  pre: string;
  /** "Today", "Tomorrow", "Thu 22 Oct", "Backlog". */
  where: string;
  /** "Platform · due Thu 22 Oct · note · 2 files". */
  extra: string;
}

/** The foot of Quick Add: where the task will land and what goes with it. */
export function landsWords(
  draft: {
    planned: IsoDate | null;
    due?: IsoDate | null;
    projectName?: string | null;
    note?: string;
    files?: number;
  },
  today: IsoDate,
): LandsWords {
  const extra: string[] = [];
  if (draft.projectName) extra.push(draft.projectName);
  if (draft.due) extra.push(`due ${formatDay(draft.due)}`);
  if (draft.note && !isEmptyHtml(toHtml(draft.note))) extra.push('note');
  if (draft.files) extra.push(`${draft.files} ${draft.files === 1 ? 'file' : 'files'}`);
  const where = draft.planned ? dayWord(draft.planned, today) : 'Backlog';
  return { pre: draft.planned ? 'Lands on ' : 'Lands in ', where, extra: extra.join(' · ') };
}

/** "Added to Today", "Added to Backlog". */
export function addedWords(planned: IsoDate | null, today: IsoDate): string {
  return `Added to ${planned ? dayWord(planned, today) : 'Backlog'}`;
}

/** Made from a note: "‘Call the venue’ is on Today in Personal, linked to this note." */
export function linkedWords(title: string, planned: IsoDate | null, today: IsoDate, space: string): string {
  const short = title.length > 60 ? `${title.slice(0, 59)}…` : title;
  const where = planned ? `on ${dayWord(planned, today)}` : 'in the Backlog';
  return `‘${short}’ is ${where} in ${space}, linked to this note.`;
}

/** "248 KB", "1.2 MB". */
export function fileSize(bytes: number): string {
  const k = Math.max(1, Math.round(bytes / 1024));
  return k > 1024 ? `${(k / 1024).toFixed(1)} MB` : `${k} KB`;
}

/** Files may be this big. */
export const FILE_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Where Quick Add plans a task by default: the day in view on Today, the first day of the shown week that is not
 * gone by on the Week, and no day at all on the Backlog, so the task lands there.
 */
export function pagePlannedDay(
  page: AppPage | null,
  at: { shownDay: IsoDate; monday: IsoDate; today: IsoDate },
): IsoDate | null {
  if (page === 'backlog') return null;
  if (page === 'week') return weekPlannedDay(at.monday, at.today);
  return at.shownDay;
}

/** The note a task is being made from, carried by New task until it is added (or its pill is dropped). */
export interface QuickAddFrom {
  noteId: string;
  /** Its title, else its first line, else "This note". */
  name: string;
}

function escapeText(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Words selected in a note, as New task opens on them: the first line is the title (cut at a word past half of
 * TITLE_MAX when it runs longer, the rest of that line leading the note), every other line a paragraph of the note.
 */
export function taskFromWords(raw: string): { title: string; note: string } {
  const lines = raw
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const first = lines[0] ?? '';
  let title = first;
  let rest = lines.slice(1);
  if (first.length > TITLE_MAX) {
    const cut = first.slice(0, TITLE_MAX);
    const space = cut.lastIndexOf(' ');
    title = (space > TITLE_MAX / 2 ? cut.slice(0, space) : cut).trimEnd();
    rest = [first.slice(title.length).trim(), ...rest];
  }
  return { title, note: rest.length ? rest.map((l) => `<p>${escapeText(l)}</p>`).join('') : '' };
}
