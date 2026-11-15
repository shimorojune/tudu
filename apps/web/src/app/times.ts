import type { TimeWordsOptions } from '@tudu/core';
import { useEffect, useState } from 'react';
import { taskStore } from './tasks';

/** 24-hour words when the system clock reads 24-hour, else 12-hour (docs/plans/task-times.md). */
export function systemTimeWords(): TimeWordsOptions {
  try {
    const c = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return c === 'h23' || c === 'h24' ? { hour24: true } : {};
  } catch {
    return {};
  }
}

export const timeWords: TimeWordsOptions = systemTimeWords();

/** The wall clock, turned at each new minute: the due pill goes red at its minute, not at midnight. */
export function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const next = () => {
      const d = new Date();
      id = setTimeout(
        () => {
          setNow(new Date());
          next();
        },
        60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50,
      );
    };
    next();
    return () => clearTimeout(id);
  }, []);
  return now;
}

/** The row's time handlers, the same on every list. */
export const rowTimes = {
  timeWords,
  onTimeChange: (t: { key: string }, v: Parameters<typeof taskStore.time>[1]) => taskStore.time(t.key, v),
  onSpanChange: (t: { key: string }, from: string, until: string | null) => taskStore.span(t.key, from, until),
  onDueTimeChange: (t: { key: string }, at: string | null) => taskStore.dueTime(t.key, at),
};
