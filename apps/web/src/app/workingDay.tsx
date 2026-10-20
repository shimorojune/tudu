import { dayTurn, isIsoDate, isoToday, type IsoDate } from '@tudu/core';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * The working day: what "today" is for the app. It follows the calendar, except in the small hours: after midnight
 * the list stays where it was and the page asks ("It's 00:40 on Monday. You're still on Sunday's list.") until
 * 04:00, when it moves on by itself. The rules live in @tudu/core (dayTurn).
 */
export interface WorkingDay {
  today: IsoDate;
  /** Set while the page is asking whether to start the new day. */
  night: { now: Date; from: IsoDate; to: IsoDate } | null;
  start: () => void;
  stay: () => void;
}

const KEY = 'tudu.day';
/** How often the page looks at the clock while it stays open. */
export const CLOCK_CHECK_MS = 30_000;

interface Saved {
  day: IsoDate;
  stayed: IsoDate | null;
}

function read(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    return v && isIsoDate(v.day) ? { day: v.day, stayed: isIsoDate(v.stayed) ? v.stayed : null } : null;
  } catch {
    return null;
  }
}

function write(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* a private window: the day is still right for this visit */
  }
}

interface State extends Saved {
  night: WorkingDay['night'];
}

function decide(saved: Saved | null, now = new Date()): State {
  if (!saved) return { day: isoToday(now), stayed: null, night: null };
  const turn = dayTurn(saved.day, now, saved.stayed);
  if (turn.kind === 'switch') return { day: turn.to, stayed: null, night: null };
  if (turn.kind === 'ask') return { ...saved, night: { now, from: turn.from, to: turn.to } };
  return { ...saved, night: null };
}

const Ctx = createContext<WorkingDay | null>(null);

export function WorkingDayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => decide(read()));
  useEffect(() => write({ day: state.day, stayed: state.stayed }), [state.day, state.stayed]);
  useEffect(() => {
    const check = () => setState((s) => decide({ day: s.day, stayed: s.stayed }));
    const t = setInterval(check, CLOCK_CHECK_MS);
    const vis = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('focus', check);
    };
  }, []);
  const start = useCallback(
    () => setState((s) => (s.night ? { day: s.night.to, stayed: null, night: null } : s)),
    [],
  );
  const stay = useCallback(
    () => setState((s) => (s.night ? { ...s, stayed: s.night.to, night: null } : s)),
    [],
  );
  return (
    <Ctx.Provider value={{ today: state.day, night: state.night, start, stay }}>{children}</Ctx.Provider>
  );
}

export function useWorkingDay(): WorkingDay {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkingDay needs a WorkingDayProvider');
  return v;
}
