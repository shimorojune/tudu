import {
  assertOpenNowCountWithinCap,
  canPlaceInNow,
  NOW_CAP_EXCEEDED_MESSAGE,
  type Bucket,
  type Lane,
  type Task,
} from "@tudu/shared";

export { NOW_CAP_EXCEEDED_MESSAGE };

function placementsFromLanes(lanes: Lane[]) {
  return lanes.flatMap((lane) =>
    lane.taskIds.map((taskId) => ({
      taskId,
      scheduledDate: lane.scheduledDate,
      bucket: lane.bucket,
    })),
  );
}

export function lanesExceedNowCap(
  beforeTasks: Task[],
  lanes: Lane[],
  today: string,
): boolean {
  try {
    assertOpenNowCountWithinCap({
      today,
      beforeTasks,
      placements: placementsFromLanes(lanes),
    });
    return false;
  } catch {
    return true;
  }
}

export function canMoveTaskToNow(args: {
  openTasks: Task[];
  today: string;
  selectedDate: string;
  task: Task;
}): boolean {
  if (args.selectedDate !== args.today) {
    return true;
  }
  const openNowCountOnToday = args.openTasks.filter(
    (task) =>
      task.bucket === "now" &&
      task.scheduledDate === args.today &&
      task.completedAt === null,
  ).length;
  return canPlaceInNow({
    today: args.today,
    targetDate: args.selectedDate,
    targetBucket: "now",
    openNowCountOnToday,
    currentScheduledDate: args.task.scheduledDate,
    currentBucket: args.task.bucket,
  });
}

export function canScheduleInNow(args: {
  today: string;
  targetDate: string | null;
  openNowCountOnToday: number;
  currentTask?: Task | null;
}): boolean {
  return canPlaceInNow({
    today: args.today,
    targetDate: args.targetDate,
    targetBucket: "now",
    openNowCountOnToday: args.openNowCountOnToday,
    currentScheduledDate: args.currentTask?.scheduledDate,
    currentBucket: args.currentTask?.bucket,
  });
}

export function canAddNewTaskToNow(args: {
  today: string;
  scheduledDate: string | null;
  bucket: Bucket;
  openNowCountOnToday: number;
}): boolean {
  return canPlaceInNow({
    today: args.today,
    targetDate: args.scheduledDate,
    targetBucket: args.bucket,
    openNowCountOnToday: args.openNowCountOnToday,
  });
}
