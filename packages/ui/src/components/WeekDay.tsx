import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';
import { Icon } from '../lib/icons';

export interface WeekDayProps {
  /** `tile`: a small sheet in the desk's grid. `section`: a day that folds, on tablets and phones. */
  variant?: 'tile' | 'section';
  /** "Sunday", or "Backlog". */
  day: string;
  /** "18 Oct". */
  date?: string;
  /** "Today", "Tomorrow", "In 3 days", "No date". Brand on today, quiet elsewhere. */
  eyebrow?: string;
  today?: boolean;
  /** A day gone by: quieter. */
  past?: boolean;
  /** The Backlog's tile: a lighter paper with a hairline. */
  quiet?: boolean;
  /** "3 tasks", "2 of 7". */
  count?: string;
  /** Nothing on it: says so, and the (empty) list stays as a place to drop a task. */
  empty?: boolean;
  emptyText?: string;
  /** A folded section's one line: its open tasks. */
  preview?: string;
  /** A section's fold, controlled. */
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  /** What screen readers call it: "Today, Sunday 18 October". */
  label?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * One day of the week. On the desk a tile: a small sheet with the day's header and a list that scrolls inside it.
 * On tablets and phones a section of one sheet: tapping its header turns the chevron and folds the list open by its
 * real height, and shut again; the one-line preview shows while it is shut. The week has no writing line: an empty
 * day says "Nothing planned" and still takes a dropped task.
 */
export function WeekDay({
  variant = 'section',
  day,
  date,
  eyebrow,
  today,
  past,
  quiet,
  count,
  empty,
  emptyText = 'Nothing planned',
  preview,
  open: openProp,
  defaultOpen = true,
  onToggle,
  label,
  className,
  style,
  children,
}: WeekDayProps) {
  const tile = variant === 'tile';
  const [own, setOwn] = useControllable(openProp, defaultOpen);
  const open = tile ? true : own;
  const toggle = () => {
    const next = !open;
    setOwn(next);
    onToggle?.(next);
  };
  const head = (
    <>
      {today || eyebrow ? (
        <span className={cx('tp-eyebrow tp-wd-eb', !today && 'tp-eb-quiet')}>{eyebrow || 'Today'}</span>
      ) : null}
      <span className="tp-wd-name">
        <span className="tp-wd-day">{day}</span>
        {date ? <span className="tp-wd-date">{date}</span> : null}
      </span>
      <span className="tp-wd-count">{count || ''}</span>
    </>
  );
  const body = (
    <div className="tp-wd-body">
      {empty ? <p className="tp-wd-none">{emptyText}</p> : null}
      {children}
    </div>
  );
  return (
    <section
      className={cx(
        'tp-root tp-wd',
        tile ? 'tp-sheet tp-wd-tile' : 'tp-wd-sec',
        today && 'tp-wd-today',
        past && 'tp-wd-past',
        quiet && 'tp-wd-quiet',
        !tile && open && 'tp-open',
        className,
      )}
      style={style}
      aria-label={label ?? `${day}${date ? ` ${date}` : ''}`}
    >
      {tile ? (
        <div className="tp-wd-head">{head}</div>
      ) : (
        <button type="button" className="tp-wd-head" aria-expanded={open ? 'true' : 'false'} onClick={toggle}>
          <span className="tp-wd-chev" aria-hidden="true">
            <Icon name="right" size={14} />
          </span>
          {head}
          <span className={cx('tp-wd-peek', open && 'tp-hide')} aria-hidden={open ? 'true' : undefined}>
            {preview || (empty ? emptyText : '')}
          </span>
        </button>
      )}
      {tile ? (
        body
      ) : (
        <div className="tp-wd-fold" inert={!open}>
          <div>{body}</div>
        </div>
      )}
    </section>
  );
}

export interface WeekTilesProps {
  /** Tiles across: four by default, two on a narrow window. */
  columns?: number;
  className?: string;
  children?: ReactNode;
}

/** The desk's week: days as small sheets in a grid, the Backlog last. */
export function WeekTiles({ columns, className, children }: WeekTilesProps) {
  return (
    <div
      className={cx('tp-root tp-wk-tiles', className)}
      style={columns ? ({ '--wk-cols': columns } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
