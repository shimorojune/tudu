import { fmtTime, minutesOf, timeOf, type Clock } from '@tudu/core';
import { useRef, type KeyboardEvent } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';

export interface TimeFieldProps {
  /** Read aloud before the time: "Starts at", "Ends at", "Due at". */
  label: string;
  value: Clock;
  onChange?: (t: Clock) => void;
  /** A new time this field must accept; a refused one leaves the value as it is and calls `onBad(true)`. */
  ok?: (t: Clock) => boolean;
  onBad?: (bad: boolean) => void;
  /** The red edge: the time cannot be kept. */
  bad?: boolean;
  /** Not focusable (a still on a board). */
  still?: boolean;
}

type Seg = 'h' | 'm' | 'p';

function parts(t: Clock): { h: number; m: number; pm: boolean } {
  const n = minutesOf(t) ?? 0;
  const hh = Math.floor(n / 60);
  return { h: hh % 12 || 12, m: n % 60, pm: hh >= 12 };
}

/**
 * A time of day as three spinbuttons: hour, minutes, AM/PM (docs/plans/task-times.md). Typing replaces the part
 * ("3", "0", "5" is 3:05), Up and Down step it (hours by one, minutes by five, wrapping AM and PM), Left and
 * Right move between parts. The small arrows on the right step the part last focused.
 */
export function TimeField({ label, value, onChange, ok, onBad, bad, still }: TimeFieldProps) {
  const q = parts(value);
  const n = minutesOf(value) ?? 0;
  const box = useRef<HTMLDivElement | null>(null);
  const buf = useRef<{ s: string; t: number; seg: Seg | null }>({ s: '', t: 0, seg: null });
  const last = useRef<Seg>('h');

  function set(m: number): boolean {
    const t = timeOf(((m % 1440) + 1440) % 1440);
    if (ok && !ok(t)) {
      onBad?.(true);
      return false;
    }
    onBad?.(false);
    if (t !== value) onChange?.(t);
    return true;
  }
  function step(seg: Seg, d: number) {
    if (seg === 'h') set(n + 60 * d);
    else if (seg === 'm') set(Math.floor(n / 60) * 60 + (((((Math.round(q.m / 5) + d) * 5) % 60) + 60) % 60));
    else set(n + 720);
  }
  function go(seg: Seg) {
    box.current?.querySelector<HTMLElement>(`[data-seg="${seg}"]`)?.focus();
  }
  function key(seg: Seg, e: KeyboardEvent<HTMLSpanElement>) {
    const k = e.key;
    const b = buf.current;
    const now = Date.now();
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      step(seg, k === 'ArrowUp' ? 1 : -1);
      return;
    }
    if (k === 'ArrowRight' || k === ':') {
      e.preventDefault();
      go(seg === 'h' ? 'm' : 'p');
      return;
    }
    if (k === 'ArrowLeft') {
      e.preventDefault();
      go(seg === 'p' ? 'm' : 'h');
      return;
    }
    if (/^[ap]$/i.test(k)) {
      e.preventDefault();
      if ((k.toLowerCase() === 'p') !== q.pm) set(n + 720);
      return;
    }
    if (seg === 'p' || !/^[0-9]$/.test(k)) return;
    e.preventDefault();
    const fresh = b.seg !== seg || now - b.t > 1500 || b.s.length >= 2;
    b.s = (fresh ? '' : b.s) + k;
    b.t = now;
    b.seg = seg;
    let v = Number(b.s);
    const base = q.pm ? 720 : 0;
    if (seg === 'h') {
      if (v < 1 || v > 12) {
        v = Number(k);
        b.s = k;
      }
      if (v < 1) return;
      set(base + (v % 12) * 60 + q.m);
      if (b.s.length === 2 || v > 1) {
        b.s = '';
        go('m');
      }
    } else {
      if (v > 59) {
        v = Number(k);
        b.s = k;
      }
      set(Math.floor(n / 60) * 60 + v);
      if (b.s.length === 2 || v > 5) {
        b.s = '';
        go('p');
      }
    }
  }
  const seg = (id: Seg, text: string, aria: string, now: number, min: number, max: number) => (
    <span
      data-seg={id}
      className="tp-tf-seg"
      role="spinbutton"
      tabIndex={still ? -1 : 0}
      aria-label={aria}
      aria-valuenow={now}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={text}
      onFocus={() => {
        last.current = id;
      }}
      onKeyDown={(e) => key(id, e)}
      onClick={id === 'p' ? () => set(n + 720) : undefined}
    >
      {text}
    </span>
  );
  return (
    <div
      ref={box}
      className={cx('tp-tf', bad && 'tp-bad')}
      role="group"
      aria-label={`${label} ${fmtTime(value)}`}
    >
      {seg('h', String(q.h), 'Hour', q.h, 1, 12)}
      <span className="tp-tf-c" aria-hidden="true">
        :
      </span>
      {seg('m', String(q.m).padStart(2, '0'), 'Minutes', q.m, 0, 59)}
      {seg('p', q.pm ? 'PM' : 'AM', 'AM or PM', q.pm ? 1 : 0, 0, 1)}
      <span className="tp-tf-step">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Later"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => step(last.current, 1)}
        >
          <Icon name="up" size={10} stroke={2.6} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Earlier"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => step(last.current, -1)}
        >
          <Icon name="down" size={10} stroke={2.6} />
        </button>
      </span>
    </div>
  );
}
