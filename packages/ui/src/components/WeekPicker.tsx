import {
  MONTHS_LONG,
  MONTHS_SHORT,
  addDays,
  isoToday,
  isoWeekNumber,
  mondayOf,
  partsOf,
  toIso,
  type IsoDate,
} from '@tudu/core';
import { useState } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { IconButton } from './IconButton';

export interface WeekPickerProps {
  today?: IsoDate;
  /** The Monday of the week being shown. */
  selected?: IsoDate;
  /** A dot on days with tasks: { "2026-10-19": 3 }. */
  marks?: Record<string, number>;
  /** Gets the Monday of the week picked. */
  onPick?: (monday: IsoDate) => void;
  label?: string;
  className?: string;
}

interface WeekRow {
  monday: IsoDate;
  number: number;
  days: IsoDate[];
}

const DOW = ['Wk', 'M', 'T', 'W', 'T', 'F', 'S', 'S'];

function ym(iso: string): { y: number; m: number } {
  const { year, month } = partsOf(iso);
  return { y: year, m: month };
}

/** "19 – 25 October", or "28 Sep – 4 Oct" across a month. */
export function weekRowLabel(monday: IsoDate): string {
  const a = partsOf(monday);
  const b = partsOf(addDays(monday, 6));
  return a.month === b.month
    ? `${a.day} – ${b.day} ${MONTHS_LONG[a.month - 1]}`
    : `${a.day} ${MONTHS_SHORT[a.month - 1]} – ${b.day} ${MONTHS_SHORT[b.month - 1]}`;
}

/** The weeks of a month: from the week holding the 1st, until the last week that still holds a day of the month. */
export function weekRowsOf(y: number, m: number): WeekRow[] {
  const rows: WeekRow[] = [];
  let monday = mondayOf(toIso(y, m, 1));
  for (let w = 0; w < 6; w++) {
    if (w > 3 && partsOf(monday).month !== m) break;
    rows.push({
      monday,
      number: isoWeekNumber(monday),
      days: Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    });
    monday = addDays(monday, 7);
  }
  return rows;
}

/**
 * A month of weeks, for jumping to one. Each row is a week with its number and seven days; a dot means the day has
 * tasks; the chosen week is filled with ink and this week is marked. The line under the grid names the week under
 * the pointer. Arrows change the month; "This week" takes you back.
 */
export function WeekPicker({
  today,
  selected,
  marks = {},
  onPick,
  label = 'Pick a week',
  className,
}: WeekPickerProps) {
  const now = today ?? isoToday();
  const thisMonday = mondayOf(now);
  const [view, setView] = useState(() => ym(selected ?? now));
  const [hover, setHover] = useState<IsoDate | null>(null);
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
  const rows = weekRowsOf(view.y, view.m);
  const shown = rows.find((r) => r.monday === (hover ?? selected));
  return (
    <div className={cx('tp-root tp-cal tp-wkp', className)} role="group" aria-label={label}>
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
      <div className="tp-wkp-dow" aria-hidden="true">
        {DOW.map((d, j) => (
          <span key={j}>{d}</span>
        ))}
      </div>
      <div className="tp-wkp-g" onMouseLeave={() => setHover(null)}>
        {rows.map((r) => {
          const on = r.monday === selected;
          return (
            <button
              key={r.monday}
              type="button"
              className={cx('tp-wkp-row', on && 'tp-sel', r.monday === thisMonday && 'tp-now')}
              aria-pressed={on ? 'true' : 'false'}
              aria-label={`Week ${r.number}, ${weekRowLabel(r.monday)}`}
              data-monday={r.monday}
              onMouseEnter={() => setHover(r.monday)}
              onFocus={() => setHover(r.monday)}
              onBlur={() => setHover(null)}
              onClick={() => onPick?.(r.monday)}
            >
              <span className="tp-wkp-no">{r.number}</span>
              {r.days.map((k) => (
                <span
                  key={k}
                  className={cx('tp-wkp-d', partsOf(k).month !== view.m && 'tp-out', k === now && 'tp-today')}
                >
                  {partsOf(k).day}
                  {marks[k] ? <i aria-hidden="true" /> : null}
                </span>
              ))}
            </button>
          );
        })}
      </div>
      <div className="tp-cal-hint" aria-live="polite" data-testid="week-hint">
        {shown ? `Week ${shown.number} · ${weekRowLabel(shown.monday)}` : 'Pick a week'}
      </div>
      <div className="tp-cal-f">
        <Button
          variant="quiet"
          onClick={() => {
            setView(ym(thisMonday));
            onPick?.(thisMonday);
          }}
        >
          This week
        </Button>
      </div>
    </div>
  );
}
