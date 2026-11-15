import { formatDay, spanDays, type IsoDate, type TimeBlock } from '@tudu/core';
import { useState } from 'react';
import { MiniCalendar, type CalendarHint, type CalendarPreset, type MiniCalendarProps } from './MiniCalendar';
import { Switch } from './Switch';
import { TimeChoice } from './TimeChoice';

/** The Several days mark: a calendar with an arrow across it. */
function DaysIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect x={3} y={4} width={18} height={18} rx={2} />
      <path d="M8 16h8m-3-3 3 3-3 3" />
    </svg>
  );
}

export interface SpanChoiceProps {
  until: IsoDate | null;
  /** Picking the last day: the switch is on before a last day is set. */
  picking?: boolean;
  onStart: () => void;
  onClear: () => void;
}

/**
 * One row under the month: "Several days" with a switch. On, the month picks the last day; off, the task is back on
 * one day. Set, the row reads the last day quietly beside its label.
 */
export function SpanChoice({ until, picking, onStart, onClear }: SpanChoiceProps) {
  const on = !!until || !!picking;
  return (
    <div className="tp-root tp-tc tp-sc">
      <label className="tp-sc-row">
        <span className="tp-sc-l">
          <span className="tp-bl-ic" aria-hidden="true">
            <DaysIcon />
          </span>
          Several days
        </span>
        <span key={until ?? (on ? 'pick' : 'off')} className="tp-sc-words" aria-live="polite">
          {until ? `until ${formatDay(until)}` : ''}
        </span>
        <Switch label="Several days" checked={on} onChange={(v) => (v ? onStart() : onClear())} />
      </label>
    </div>
  );
}

export interface PlanPickerProps {
  /** The calendar's own props (today, month, marks). */
  cal: MiniCalendarProps;
  today: IsoDate;
  /** The first day; null in the Backlog (then there are no days or time to set). */
  day: IsoDate | null;
  until: IsoDate | null;
  time: TimeBlock | null;
  presets?: CalendarPreset[];
  onPreset?: (v: IsoDate | null) => void;
  /** One day picked with no span: the task moves (the pop closes). */
  onDay?: (d: IsoDate) => void;
  /** Several days: from `a` to `b` (null back to one day on `a`). Without it there is no Several days row. */
  onSpan?: (a: IsoDate, b: IsoDate | null) => void;
  /** Without it there is no time. */
  onTime?: (t: TimeBlock | null) => void;
  hint?: (d: IsoDate) => CalendarHint | string;
  hintEmpty?: string;
  now?: Date;
  /** The switch starts on, asking for the last day. */
  picking?: boolean;
}

/**
 * Planned's picker (docs/plans/task-times.md): the month, then Several days, then the time. A day with no span moves
 * the task, as before. With a span set, a click starts a new span on that day (held here until the other end is
 * picked, so closing halfway changes nothing); the next click picks the other end, either side of it. Right after
 * the switch goes on, the task's day is the start and one click picks the other end.
 */
export function PlanPicker(p: PlanPickerProps) {
  const [picking, setPicking] = useState(!!p.picking);
  const [pend, setPend] = useState<IsoDate | null>(null);
  const day = p.day;
  const until = p.until && day && p.until > day ? p.until : null;
  const ranging = !!day && (picking || !!until || !!pend);
  const start = pend ?? (picking && !until ? day : null);
  const words = (a: IsoDate, z: IsoDate) => `${formatDay(a)} to ${formatDay(z)} · ${spanDays(a, z)} days`;

  function pick(k: IsoDate) {
    if (!ranging) {
      p.onDay?.(k);
      return;
    }
    if (!start) {
      setPend(k);
      return;
    }
    if (k === start) return;
    setPend(null);
    setPicking(false);
    p.onSpan?.(k < start ? k : start, k < start ? start : k);
  }

  return (
    <>
      <MiniCalendar
        {...p.cal}
        selected={start ?? day ?? undefined}
        until={start ? null : until}
        presets={p.presets}
        onPreset={(k) => {
          setPicking(false);
          setPend(null);
          p.onPreset?.(k);
        }}
        onPick={pick}
        hint={
          ranging
            ? (k) => {
                if (start) {
                  const a = k < start ? k : start;
                  const z = k < start ? start : k;
                  return { text: k === start ? 'Pick the last day' : words(a, z) };
                }
                return {
                  text: k === day || k === until ? words(day!, until!) : `Start again on ${formatDay(k)}`,
                };
              }
            : p.hint
        }
        hintEmpty={ranging ? (start ? 'Pick the last day' : words(day!, until!)) : p.hintEmpty}
      />
      {day && p.onSpan ? (
        <SpanChoice
          until={start ? null : until}
          picking={picking || !!pend}
          onStart={() => setPicking(true)}
          onClear={() => {
            setPicking(false);
            setPend(null);
            if (until) p.onSpan!(day, null);
          }}
        />
      ) : null}
      {day && p.onTime ? (
        <TimeChoice
          kind="block"
          multi={!!until}
          value={p.time}
          isToday={day === p.today}
          now={p.now}
          onChange={p.onTime}
        />
      ) : null}
    </>
  );
}
