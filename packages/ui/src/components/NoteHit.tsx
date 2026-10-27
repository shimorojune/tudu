import { cx } from '../lib/cx';
import { NoteIcon, noteLabel } from './NoteParts';
import { markWords } from './SearchHit';

/** A note as Search lists it. */
export interface NoteHitItem {
  /** The note's id. */
  key: string;
  title: string;
  first?: string;
  /** The line inside that matched, when the title alone didn't. */
  snippet?: string | null;
  /** "Northwind / Planning", or none. */
  where?: string | null;
  /** "4m", "Thu". */
  edited?: string | null;
  links?: number;
}

export interface NoteHitProps {
  item: NoteHitItem;
  tokens?: string[];
  id?: string;
  active?: boolean;
  onPick?: () => void;
  onHover?: () => void;
}

/**
 * A note in Search, under its own Notes heading: the note mark, the title with the words washed in ink, the line
 * inside that matched, then its folder and when it changed.
 */
export function NoteHit(p: NoteHitProps) {
  const it = p.item;
  return (
    <button
      type="button"
      role="option"
      id={p.id}
      tabIndex={-1}
      aria-selected={p.active ? true : false}
      className={cx('tp-root tp-sh tp-nb-hit', p.active && 'tp-on')}
      onClick={p.onPick}
      onMouseMove={p.onHover}
    >
      <span className="tp-sh-mark tp-nb-hit-mark" aria-hidden="true">
        <NoteIcon name="note" size={13} />
      </span>
      <span className="tp-sh-main">
        <span className={cx('tp-sh-title', !it.title.trim() && 'tp-nb-untitled')}>
          {markWords(noteLabel(it), p.tokens)}
        </span>
        {it.snippet ? <span className="tp-sh-snip">{markWords(it.snippet, p.tokens)}</span> : null}
        <span className="tp-sh-by">
          <span className="tp-sh-where">{it.where || 'Notebook'}</span>
          {it.links ? (
            <span className="tp-sh-id">{it.links === 1 ? '1 task' : `${it.links} tasks`}</span>
          ) : null}
          {it.edited ? <span className="tp-sh-id">{it.edited}</span> : null}
        </span>
      </span>
    </button>
  );
}
