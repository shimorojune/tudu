import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { JiraMark } from './JiraMark';

/** One task as the search panel shows it. */
export interface SearchItem {
  /** The task's id. */
  key: string;
  /** The task ID people see, "ME-52". */
  id: string;
  title: string;
  done?: boolean;
  /** Where it lives: "Today" (in the brand tone), "Tomorrow", "Fri 23 Oct", "Backlog", "… · crossed off". */
  where: { label: string; tone?: 'today' | null };
  project?: { name: string; color: string } | null;
  jira?: string | null;
  /** A line of the note around the matched word. */
  snippet?: string | null;
  /** The space it lives in, when it is not the one you are looking at (close matches come from every space). */
  space?: { name: string; color: string | null } | null;
}

export interface SearchHitProps {
  id?: string;
  active?: boolean;
  /** The words typed, so the matches are washed in ink. */
  tokens?: string[];
  /** A task. */
  item?: SearchItem;
  /** A search you made before: a small clock and the words. */
  query?: string;
  /** The Create row: "Create “…”" with a note under it. */
  create?: string;
  note?: string;
  onPick?: () => void;
  onHover?: () => void;
  className?: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The words that matched, washed in ink (never red: red means today). */
export function markWords(text: string, tokens: string[] | undefined): ReactNode {
  if (!tokens?.length) return text;
  const re = new RegExp(
    `(${[...tokens]
      .sort((a, b) => b.length - a.length)
      .map(escapeRe)
      .join('|')})`,
    'ig',
  );
  return text.split(re).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="tp-hl">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/**
 * One row of the search results: a ring for open, a small tick for crossed off; the title with the matched words
 * washed in ink; then where it lives, the project, the Jira key and the task ID. Also the recent-search row and
 * the Create row.
 */
export function SearchHit(p: SearchHitProps) {
  const common = {
    type: 'button' as const,
    role: 'option',
    id: p.id,
    'aria-selected': p.active ? true : false,
    tabIndex: -1,
    onClick: p.onPick,
    onMouseMove: p.onHover,
  };
  if (p.query !== undefined) {
    return (
      <button {...common} className={cx('tp-root tp-sh tp-sh-query', p.active && 'tp-on', p.className)}>
        <span className="tp-sh-mark" aria-hidden="true">
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <span className="tp-sh-main">
          <span className="tp-sh-title">{p.query}</span>
        </span>
      </button>
    );
  }
  if (p.create !== undefined) {
    return (
      <button {...common} className={cx('tp-root tp-sh tp-sh-create', p.active && 'tp-on', p.className)}>
        <span className="tp-sh-mark" aria-hidden="true">
          <Icon name="plus" size={14} />
        </span>
        <span className="tp-sh-main">
          <span className="tp-sh-title">
            Create <b>“{p.create}”</b>
          </span>
          <span className="tp-sh-by">
            <span>{p.note ?? 'Opens Quick Add with this as the title'}</span>
          </span>
        </span>
      </button>
    );
  }
  const it = p.item!;
  const toks = p.tokens;
  return (
    <button
      {...common}
      className={cx('tp-root tp-sh', p.active && 'tp-on', it.done && 'tp-done', p.className)}
      aria-label={`${it.title}, ${it.where.label}`}
    >
      <span className="tp-sh-mark" aria-hidden="true">
        {it.done ? (
          <svg viewBox="0 0 24 24" fill="none" width={12} height={12}>
            <path
              d="M5 12.4 9.8 17.2 19.2 6.8"
              stroke="currentColor"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <i />
        )}
      </span>
      <span className="tp-sh-main">
        <span className="tp-sh-title">{markWords(it.title, toks)}</span>
        {it.snippet ? <span className="tp-sh-snip">{markWords(it.snippet, toks)}</span> : null}
        <span className="tp-sh-by">
          {it.space ? (
            <span className="tp-sh-space">
              <i className="tp-sh-tile" style={it.space.color ? { background: it.space.color } : undefined} />
              {it.space.name}
            </span>
          ) : null}
          <span className={cx('tp-sh-where', it.where.tone === 'today' && 'tp-today')}>{it.where.label}</span>
          {it.project ? (
            <span className="tp-sh-proj">
              <i className="tp-sh-dot" style={{ background: it.project.color }} />
              {it.project.name}
            </span>
          ) : null}
          {it.jira ? (
            <span className="tp-sh-jira">
              <JiraMark size={11} />
              <span>{markWords(it.jira, toks)}</span>
            </span>
          ) : null}
          <span className="tp-sh-id">{markWords(it.id, toks)}</span>
        </span>
      </span>
    </button>
  );
}
