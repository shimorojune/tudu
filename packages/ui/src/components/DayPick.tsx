import { useRef, type KeyboardEvent } from 'react';
import { DAY_NAMES } from '@tudu/core';
import { cx } from '../lib/cx';

export interface DayPickProps {
  /** The days picked: 1 = Monday ... 7 = Sunday. */
  days: number[];
  onChange?: (days: number[]) => void;
  /** Names the group for screen readers. */
  label?: string;
  className?: string;
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Seven round toggles, Monday first; a pressed day is ink, like a picked day in the calendar. Each reads its full
 * name aloud. Arrow keys move along the week.
 */
export function DayPick({ days, onChange, label = 'Days', className }: DayPickProps) {
  const box = useRef<HTMLDivElement>(null);
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    box.current?.querySelectorAll<HTMLButtonElement>('button')[(i + step + 7) % 7]?.focus();
  };
  return (
    <div ref={box} className={cx('tp-root tp-dpick', className)} role="group" aria-label={label}>
      {DAY_NAMES.map((name, i) => {
        const day = i + 1;
        const on = days.includes(day);
        return (
          <button
            key={day}
            type="button"
            className="tp-dpick-d"
            aria-pressed={on ? 'true' : 'false'}
            aria-label={name}
            onKeyDown={(e) => move(e, i)}
            onClick={() =>
              onChange?.(on ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b))
            }
          >
            {LETTERS[i]}
          </button>
        );
      })}
    </div>
  );
}
