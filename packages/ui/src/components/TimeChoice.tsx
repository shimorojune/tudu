import { blockFrom, clockOf, minutesOf, nextFullHour, timeOf, type Clock, type TimeBlock } from '@tudu/core';
import { useEffect, useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { useHeightEase } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { TimeField } from './TimeField';

interface Common {
  /** The day picked is today: Add a time starts at the next full hour, and a time already gone says so. */
  isToday?: boolean;
  /** The wall clock now (tests pass a fixed one). */
  now?: Date;
}

export type TimeChoiceProps = Common &
  (
    | {
        kind: 'block';
        value: TimeBlock | null;
        /** Over several days: the end is on the last day, so it may come before the start. */
        multi?: boolean;
        onChange?: (v: TimeBlock | null) => void;
      }
    | { kind: 'due'; value: Clock | null; onChange?: (v: Clock | null) => void }
  );

const BAD = 'It has to end after it starts';

/**
 * The time under a day picker (docs/plans/task-times.md). Folded it is one quiet line, "Add a time"; pressed, it
 * fills the next full hour (an hour long for Planned) and shows the fields with × to take the time off. One line
 * of words folds open under the fields only when there is something to say; the pop eases to each new height.
 */
export function TimeChoice(p: TimeChoiceProps) {
  const block = p.kind === 'block';
  const root = useRef<HTMLDivElement | null>(null);
  const fresh = useRef(false);
  const said = useRef('');
  const [bad, setBad] = useState(false);
  const at = p.value ? (p.kind === 'block' ? p.value.start : p.value) : null;
  const nowM = p.isToday ? minutesOf(clockOf(p.now ?? new Date())) : null;
  useHeightEase(root, at ? 'open' : 'add');
  useEffect(() => {
    if (!fresh.current || !root.current) return;
    fresh.current = false;
    root.current.querySelector<HTMLElement>('[data-seg="h"]')?.focus();
  }, [at]);

  if (!at) {
    return (
      <div ref={root} className="tp-root tp-tc">
        <button
          type="button"
          className="tp-tc-add"
          onClick={() => {
            const start = p.isToday ? nextFullHour(p.now ?? new Date()) : '09:00';
            fresh.current = true;
            if (p.kind === 'block') p.onChange?.(blockFrom(start));
            else p.onChange?.(start);
          }}
        >
          <span>
            <span className="tp-bl-ic" aria-hidden="true">
              <Icon name="clock" size={14} />
            </span>
            Add a time
          </span>
        </button>
      </div>
    );
  }

  const multi = p.kind === 'block' && !!p.multi;
  const end = p.kind === 'block' ? p.value!.end : null;
  const mins = end ? (minutesOf(end) ?? 0) - (minutesOf(at) ?? 0) : 60;
  const late = !multi && nowM !== null && nowM !== undefined && (minutesOf(end ?? at) ?? 0) <= nowM;
  const msg =
    !multi && bad ? BAD : late ? (block ? 'That’s already over today' : 'That time has passed today') : null;
  if (msg) said.current = msg;
  const setStart = (t: Clock) => {
    setBad(false);
    if (p.kind === 'due') return p.onChange?.(t);
    if (multi) return p.onChange?.({ start: t, end: end! });
    // One day keeps its length, inside the day.
    const s = minutesOf(t) ?? 0;
    p.onChange?.({ start: t, end: timeOf(Math.min(23 * 60 + 59, s + Math.max(5, mins))) });
  };

  return (
    <div ref={root} className="tp-root tp-tc">
      <div className="tp-tc-open">
        <div className="tp-tc-row">
          <TimeField label={block ? 'Starts at' : 'Due at'} value={at} onChange={setStart} />
          {p.kind === 'block' ? (
            <>
              <span className="tp-tc-to" aria-hidden="true">
                to
              </span>
              <TimeField
                label={multi ? 'Ends on the last day at' : 'Ends at'}
                value={end!}
                bad={!multi && bad}
                ok={multi ? undefined : (t) => (minutesOf(t) ?? 0) > (minutesOf(at) ?? 0)}
                onBad={setBad}
                onChange={(t) => p.onChange?.({ start: at, end: t })}
              />
            </>
          ) : null}
          <button
            type="button"
            className="tp-tc-x"
            aria-label="Remove time"
            title="Remove time"
            onClick={() => {
              setBad(false);
              p.onChange?.(null);
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className={cx('tp-tc-msg', msg && 'tp-in')} role="status" aria-live="polite">
          <div>
            <div className="tp-tc-warn">{said.current}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
