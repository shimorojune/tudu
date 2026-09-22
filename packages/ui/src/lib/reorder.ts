import {
  calendarDayIso,
  inProgressForPlacement,
  type Bucket,
  type Lane,
  type Task,
} from "@tudu/shared";

export type LaneKey = {
  scheduledDate: string | null;
  bucket: Bucket | null;
};

export function laneKey({ scheduledDate, bucket }: LaneKey): string {
  return `${scheduledDate ?? "null"}|${bucket ?? "null"}`;
}

export function groupTasksByLane(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();

  for (const task of tasks) {
    const key = laneKey({
      scheduledDate: task.scheduledDate,
      bucket: task.bucket,
    });
    const lane = map.get(key) ?? [];
    lane.push(task);
    map.set(key, lane);
  }

  for (const [, laneTasks] of map) {
    laneTasks.sort((a, b) => a.position - b.position);
  }

  return map;
}

export function orderedIds(tasks: Task[]): string[] {
  return [...tasks].sort((a, b) => a.position - b.position).map((t) => t.id);
}

/** Move one task within or across lanes. Returns only the lanes that changed. */
export function buildReorderLanes(args: {
  tasks: Task[];
  activeId: string;
  target: LaneKey;
  targetIndex: number;
}): Lane[] {
  const { tasks, activeId, target, targetIndex } = args;
  const active = tasks.find((t) => t.id === activeId);
  if (!active) {
    throw new Error(`Task ${activeId} not found`);
  }

  const sourceKey = laneKey({
    scheduledDate: active.scheduledDate,
    bucket: active.bucket,
  });
  const targetKey = laneKey(target);

  const sourceIds = orderedIds(
    (groupTasksByLane(tasks).get(sourceKey) ?? []).filter(
      (t) => t.id !== activeId,
    ),
  );
  const targetIds = orderedIds(
    (groupTasksByLane(tasks).get(targetKey) ?? []).filter(
      (t) => t.id !== activeId,
    ),
  );
  targetIds.splice(targetIndex, 0, activeId);

  const lanes: Lane[] = [];

  if (sourceKey !== targetKey) {
    lanes.push({
      scheduledDate: active.scheduledDate,
      bucket: active.bucket,
      taskIds: sourceIds,
    });
  }

  lanes.push({
    scheduledDate: target.scheduledDate,
    bucket: target.bucket,
    taskIds: targetIds,
  });

  return lanes;
}

/** Pull the first Next task into Now (product prompt). */
export function buildPullIntoNowLanes(
  tasks: Task[],
  scheduledDate: string,
): Lane[] {
  const grouped = groupTasksByLane(tasks);
  const nowKey = laneKey({ scheduledDate, bucket: "now" });
  const nextKey = laneKey({ scheduledDate, bucket: "next" });
  const nowIds = orderedIds(grouped.get(nowKey) ?? []);
  const nextIds = orderedIds(grouped.get(nextKey) ?? []);
  if (nextIds.length === 0) {
    return [];
  }
  const [first, ...rest] = nextIds;
  return [
    { scheduledDate, bucket: "now", taskIds: [...nowIds, first] },
    { scheduledDate, bucket: "next", taskIds: rest },
  ];
}

export function moveTaskToBucketLanes(
  tasks: Task[],
  taskId: string,
  targetBucket: Bucket,
  scheduledDate: string,
): Lane[] {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || !task.bucket) {
    return [];
  }
  const grouped = groupTasksByLane(tasks);
  const targetKey = laneKey({ scheduledDate, bucket: targetBucket });
  const targetIds = orderedIds(grouped.get(targetKey) ?? []);
  targetIds.push(taskId);
  return buildReorderLanes({
    tasks,
    activeId: taskId,
    target: { scheduledDate, bucket: targetBucket },
    targetIndex: targetIds.length - 1,
  });
}

export function unscheduleTaskLanes(tasks: Task[], taskId: string): Lane[] {
  const grouped = groupTasksByLane(tasks);
  const unscheduledKey = laneKey({ scheduledDate: null, bucket: null });
  const unscheduledIds = orderedIds(grouped.get(unscheduledKey) ?? []);
  unscheduledIds.push(taskId);
  return buildReorderLanes({
    tasks,
    activeId: taskId,
    target: { scheduledDate: null, bucket: null },
    targetIndex: unscheduledIds.length - 1,
  });
}

export function scheduleToTodayLanes(
  dayTasks: Task[],
  unscheduledTasks: Task[],
  taskId: string,
  today: string,
): Lane[] {
  const all = [...dayTasks, ...unscheduledTasks];
  const grouped = groupTasksByLane(all);
  const laterKey = laneKey({ scheduledDate: today, bucket: "later" });
  const laterIds = orderedIds(grouped.get(laterKey) ?? []);
  laterIds.push(taskId);
  return buildReorderLanes({
    tasks: all,
    activeId: taskId,
    target: { scheduledDate: today, bucket: "later" },
    targetIndex: laterIds.length - 1,
  });
}

export function applyLanesToTasks(tasks: Task[], lanes: Lane[]): Task[] {
  const placementById = new Map<
    string,
    { scheduledDate: string | null; bucket: Bucket | null; position: number }
  >();

  for (const lane of lanes) {
    lane.taskIds.forEach((taskId, index) => {
      placementById.set(taskId, {
        scheduledDate: lane.scheduledDate,
        bucket: lane.bucket,
        position: index,
      });
    });
  }

  return tasks.map((task) => {
    const placement = placementById.get(task.id);
    if (!placement) {
      return task;
    }
    const bucket = placement.bucket;
    return {
      ...task,
      scheduledDate: placement.scheduledDate,
      bucket,
      position: placement.position,
      inProgress:
        task.completedAt === null
          ? inProgressForPlacement(
              bucket,
              placement.scheduledDate,
              calendarDayIso(),
            )
          : task.inProgress,
    };
  });
}
