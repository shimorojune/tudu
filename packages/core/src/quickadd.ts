import { dayWord } from './carried';
import { formatDay, type IsoDate } from './dates';

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
  if (draft.note?.trim()) extra.push('note');
  if (draft.files) extra.push(`${draft.files} ${draft.files === 1 ? 'file' : 'files'}`);
  const where = draft.planned ? dayWord(draft.planned, today) : 'Backlog';
  return { pre: draft.planned ? 'Lands on ' : 'Lands in ', where, extra: extra.join(' · ') };
}

/** "Added to Today", "Added to Backlog". */
export function addedWords(planned: IsoDate | null, today: IsoDate): string {
  return `Added to ${planned ? dayWord(planned, today) : 'Backlog'}`;
}

/** "248 KB", "1.2 MB". */
export function fileSize(bytes: number): string {
  const k = Math.max(1, Math.round(bytes / 1024));
  return k > 1024 ? `${(k / 1024).toFixed(1)} MB` : `${k} KB`;
}

/** Files may be this big. */
export const FILE_MAX_BYTES = 25 * 1024 * 1024;
