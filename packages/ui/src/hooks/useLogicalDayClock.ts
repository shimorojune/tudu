import { DAY_START_HOUR } from "@tudu/shared";
import { useEffect, useState } from "react";

function msUntilNextDayBoundary(from: Date): number {
  const candidates: number[] = [];

  const midnight = new Date(from);
  midnight.setHours(0, 0, 0, 0);
  if (from.getTime() >= midnight.getTime()) {
    midnight.setDate(midnight.getDate() + 1);
  }
  candidates.push(midnight.getTime());

  const dayStart = new Date(from);
  dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
  if (from.getTime() >= dayStart.getTime()) {
    dayStart.setDate(dayStart.getDate() + 1);
  }
  candidates.push(dayStart.getTime());

  const next = Math.min(...candidates);
  return Math.max(1, next - from.getTime());
}

/** Re-render chrome when the calendar day or logical day-start hour crosses. */
export function useLogicalDayClock(): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    let timeoutId: number;

    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        setTick((value) => value + 1);
        schedule();
      }, msUntilNextDayBoundary(new Date()));
    };

    schedule();
    return () => window.clearTimeout(timeoutId);
  }, []);
}
