import { MONTHS_LONG, daysInMonth, toIso, weekdayOf, type IsoDate } from '@tudu/core';
import { useRef, useState, type KeyboardEvent } from 'react';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { IconButton } from './IconButton';

export interface CalendarPreset {
  label: string;
  /** An ISO day, or null for "no day" (the Backlog). */
  value: IsoDate | null;
  on?: boolean;
}

export interface CalendarHint {
  text: string;
  /** `overdue` is red, `today` is brand-text. */
  tone?: 'overdue' | 'today' | '';
}

export interface MiniCalendarProps {
  /** "2026-10". Defaults to the selected day's month, else today's. */
  month?: string;
  today?: IsoDate;
  selected?: IsoDate | null;
  defaultSelected?: IsoDate | null;
  /** A dot on days with tasks: { "2026-10-19": 3 }. */
  marks?: Record<string, number>;
  onPick?: (date: IsoDate) => void;
  /** Quick choices above the grid: Today · Tomorrow · Backlog. */
  presets?: CalendarPreset[];
  onPreset?: (value: IsoDate | null) => void;
  /** A red text action on the left of the footer ("Remove due date"). */
  onClear?: () => void;
  clearLabel?: string;
  /** A quiet line under the grid for the day under the pointer (or the selected one). */
  hint?: (date: IsoDate) => CalendarHint | string;
  hintEmpty?: string;
  label?: string;
  className?: string;
}

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function ym(iso: string): { y: number; m: number } {
  const [y, m] = iso.split('-').map(Number);
  return { y: y!, m: m! };
}

/**
 * A month on paper, for jumping to a day. Today is ringed in brand; the open day is filled with ink; a dot means
 * the day has tasks. Weeks start on Monday. Arrows change the month and the grid keeps its size. Arrow keys move
 * the focused day; Enter or Space picks it.
 */
export function MiniCalendar({
  month,
  today,
  selected,
  defaultSelected = null,
  marks = {},
  onPick,
  presets,
  onPreset,
  onClear,
  clearLabel,
  hint,
  hintEmpty,
  label = 'Pick a day',
  className,
}: MiniCalendarProps) {
  const [sel, setSel] = useControllable<IsoDate | null>(selected, defaultSelected);
  const start = month ?? (sel ?? today ?? toIso(2026, 10, 1)).slice(0, 7);
  const [view, setView] = useState(() => ym(start));
  const [hover, setHover] = useState<IsoDate | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);

  const first = toIso(view.y, view.m, 1);
  const startDow = (weekdayOf(first) + 6) % 7;
  const days = daysInMonth(view.y, view.m);
  const cells: Array<number | null> = [
    ...Array<null>(startDow).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  const key = (d: number) => toIso(view.y, view.m, d);

  const step = (n: number) => {
    setView((v) => {
      let m = v.m + n;
      let y = v.y;
      if (m < 1) {
        m = 12;
        y--;
      }
      if (m > 12) {
        m = 1;
        y++;
      }
      return { y, m };
    });
  };
  const pick = (iso: IsoDate) => {
    setSel(iso);
    onPick?.(iso);
  };
  const jump = (iso: IsoDate) => {
    const t = ym(iso);
    setView(t);
  };

  const hintKey = hover ?? sel;
  let hintValue: CalendarHint | null = null;
  if (hint && hintKey) {
    const h = hint(hintKey);
    hintValue = typeof h === 'string' ? { text: h } : h;
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current =
      focused ??
      (sel && sel.startsWith(`${view.y}-${String(view.m).padStart(2, '0')}`) ? Number(sel.slice(8)) : 1);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = current + 1;
    else if (e.key === 'ArrowLeft') next = current - 1;
    else if (e.key === 'ArrowDown') next = current + 7;
    else if (e.key === 'ArrowUp') next = current - 7;
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = days;
    if (next === null) return;
    e.preventDefault();
    if (next < 1) {
      step(-1);
      next = 1;
    } else if (next > days) {
      step(1);
      next = 1;
    }
    setFocused(next);
    requestAnimationFrame(() =>
      grid.current?.querySelector<HTMLButtonElement>(`button[data-day="${next}"]`)?.focus(),
    );
  };

  const hasPresets = !!presets?.length;
  const showToday = !!today && !hasPresets;
  const showClear = !!onClear && !!clearLabel;

  return (
    <div className={cx('tp-root tp-cal', className)} role="group" aria-label={label}>
      <div className="tp-cal-h">
        <span aria-live="polite">
          {MONTHS_LONG[view.m - 1]} {view.y}
        </span>
        <IconButton label="Previous month" tip={false} onClick={() => step(-1)}>
          <Icon name="left" size={15} />
        </IconButton>
        <IconButton label="Next month" tip={false} onClick={() => step(1)}>
          <Icon name="right" size={15} />
        </IconButton>
      </div>
      {hasPresets ? (
        <div className="tp-cal-presets">
          {presets!.map((x, j) => (
            <button
              key={j}
              type="button"
              className={cx('tp-cal-preset', x.on && 'tp-on')}
              aria-pressed={x.on ? 'true' : 'false'}
              onClick={() => {
                if (x.value) {
                  setSel(x.value);
                  jump(x.value);
                }
                if (onPreset) onPreset(x.value);
                else if (x.value) onPick?.(x.value);
              }}
            >
              {x.label}
            </button>
          ))}
        </div>
      ) : null}
      <div
        ref={grid}
        className="tp-cal-g"
        role="grid"
        aria-label={`${MONTHS_LONG[view.m - 1]} ${view.y}`}
        onMouseLeave={hint ? () => setHover(null) : undefined}
        onKeyDown={onKeyDown}
      >
        {DOW.map((d, j) => (
          <span key={`w${j}`} className="tp-cal-dow" aria-hidden="true">
            {d}
          </span>
        ))}
        {cells.map((d, j) => {
          if (!d) return <span key={`e${j}`} />;
          const k = key(d);
          const count = marks[k];
          const isSel = k === sel;
          const tab = focused ? focused === d : isSel || (!sel?.startsWith(k.slice(0, 7)) && d === 1);
          return (
            <button
              key={k}
              type="button"
              data-day={d}
              data-date={k}
              className={cx('tp-cal-d', k === today && 'tp-today', isSel && 'tp-sel')}
              aria-pressed={isSel ? 'true' : 'false'}
              aria-label={`${d} ${MONTHS_LONG[view.m - 1]}${count ? `, ${count} ${count === 1 ? 'task' : 'tasks'}` : ''}`}
              tabIndex={tab ? 0 : -1}
              onMouseEnter={hint ? () => setHover(k) : undefined}
              onFocus={() => {
                setFocused(d);
                if (hint) setHover(k);
              }}
              onBlur={hint ? () => setHover(null) : undefined}
              onClick={() => pick(k)}
            >
              {d}
              {count ? <i aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      {hint ? (
        <div
          className={cx(
            'tp-cal-hint',
            hintValue?.tone === 'overdue' && 'tp-od',
            hintValue?.tone === 'today' && 'tp-now',
          )}
          aria-live="polite"
          data-testid="calendar-hint"
        >
          {hintValue ? hintValue.text : (hintEmpty ?? 'Pick a day')}
        </div>
      ) : null}
      {showToday || showClear ? (
        <div className={cx('tp-cal-f', showClear && 'tp-cal-f2')}>
          {showClear ? (
            <button type="button" className="tp-cal-clear" onClick={onClear}>
              {clearLabel}
            </button>
          ) : null}
          {showToday ? (
            <Button
              variant="quiet"
              onClick={() => {
                setSel(today!);
                jump(today!);
                onPick?.(today!);
              }}
            >
              Today
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
