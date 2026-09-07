import type { Lane, Task } from "@tudu/shared";
import { orderedIds, groupTasksByLane, laneKey } from "./reorder.js";

/** Moves every carried task in Now to the bottom of Later, preserving order. */
export function buildPushCarriedToLaterLanes(args: {
  tasks: Task[];
  scheduledDate: string;
}): Lane[] {
  const dayTasks = args.tasks.filter(
    (task) => task.scheduledDate === args.scheduledDate,
  );
  const byLane = groupTasksByLane(dayTasks);

  const nowKey = laneKey({ scheduledDate: args.scheduledDate, bucket: "now" });
  const laterKey = laneKey({
    scheduledDate: args.scheduledDate,
    bucket: "later",
  });

  const nowTasks = byLane.get(nowKey) ?? [];
  const laterTasks = byLane.get(laterKey) ?? [];

  const carriedIds = nowTasks
    .filter((task) => task.carriedDays > 0)
    .map((task) => task.id);
  const remainingNowIds = orderedIds(
    nowTasks.filter((task) => !carriedIds.includes(task.id)),
  );
  const laterIds = orderedIds(laterTasks);
  const nextLaterIds = [...laterIds, ...carriedIds];

  const lanes: Lane[] = [];

  if (carriedIds.length > 0) {
    lanes.push({
      scheduledDate: args.scheduledDate,
      bucket: "now",
      taskIds: remainingNowIds,
    });
    lanes.push({
      scheduledDate: args.scheduledDate,
      bucket: "later",
      taskIds: nextLaterIds,
    });
  }

  return lanes;
}
