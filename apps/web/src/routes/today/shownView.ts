import { useEffect, useState } from 'react';
import type { DayView } from '../../app/dayView';

/** Between 2 days and the Backlog: the open sheet folds back first, then the other opens this long after. */
export const SWITCH_MS = 260;

/**
 * The view the desk lays out, a step behind the switch. One ↔ two and one ↔ backlog follow at once. Two ↔ backlog
 * shows one day for `SWITCH_MS`, so the open sheet has folded before the other opens and the day never stretches.
 * A new pick during that gap cancels the wait and only the last pick stands.
 */
export function useShownView(view: DayView, ms = SWITCH_MS): DayView {
  const [shown, setShown] = useState(view);
  const [seen, setSeen] = useState(view);
  // The pick waiting for the open sheet to fold; null when nothing waits.
  const [waiting, setWaiting] = useState<DayView | null>(null);
  if (view !== seen) {
    setSeen(view);
    if (shown !== 'one' && view !== 'one' && shown !== view) {
      setShown('one');
      setWaiting(view);
    } else {
      setShown(view);
      setWaiting(null);
    }
  }
  useEffect(() => {
    if (waiting === null) return;
    const id = setTimeout(() => {
      setShown(waiting);
      setWaiting(null);
    }, ms);
    return () => clearTimeout(id);
  }, [waiting, ms]);
  return shown;
}
