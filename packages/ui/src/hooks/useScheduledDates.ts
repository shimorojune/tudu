import { useMemo } from "react";
import { useSelector } from "react-redux";
import { selectVisible } from "@tudu/store";

/** ISO dates that have at least one incomplete scheduled task in the visible replica. */
export function useScheduledDates(): Set<string> {
  const replica = useSelector(selectVisible);
  return useMemo(() => {
    const dates = new Set<string>();
    for (const task of Object.values(replica.tasks)) {
      if (task.scheduledDate && !task.completedAt) {
        dates.add(task.scheduledDate);
      }
    }
    return dates;
  }, [replica.tasks]);
}
