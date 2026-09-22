import type { Bucket } from "./tasks.js";
import { DEFAULT_NOW_SOFT_CAP } from "./tasks.js";

export const NOW_CAP_EXCEEDED_MESSAGE =
  "Now is full. Finish or move one first.";

export class NowCapExceededError extends Error {
  readonly code = "now_cap_exceeded";

  constructor(message = NOW_CAP_EXCEEDED_MESSAGE) {
    super(message);
    this.name = "NowCapExceededError";
  }
}

export type TaskPlacementForNowCap = {
  taskId: string;
  scheduledDate: string | null;
  bucket: Bucket | null;
};

export type TaskBeforeNowCap = {
  id: string;
  scheduledDate: string | null;
  bucket: Bucket | null;
  completedAt: string | null;
};

export function isTodaysNowLane(
  scheduledDate: string | null,
  bucket: Bucket | null,
  today: string,
): boolean {
  return scheduledDate === today && bucket === "now";
}

export function isOpenInTodaysNow(
  task: TaskBeforeNowCap,
  today: string,
): boolean {
  return (
    task.completedAt === null &&
    isTodaysNowLane(task.scheduledDate, task.bucket, today)
  );
}

export function countOpenNowOnDate(
  tasks: TaskBeforeNowCap[],
  date: string,
): number {
  return tasks.filter(
    (task) =>
      task.completedAt === null &&
      task.scheduledDate === date &&
      task.bucket === "now",
  ).length;
}

export type CanPlaceInNowArgs = {
  today: string;
  targetDate: string | null;
  targetBucket: Bucket | null;
  openNowCountOnToday: number;
  currentScheduledDate?: string | null;
  currentBucket?: Bucket | null;
  cap?: number;
};

/** Whether a single task may be placed in today's Now lane. */
export function canPlaceInNow(args: CanPlaceInNowArgs): boolean {
  const cap = args.cap ?? DEFAULT_NOW_SOFT_CAP;
  if (!isTodaysNowLane(args.targetDate, args.targetBucket, args.today)) {
    return true;
  }
  if (
    args.currentScheduledDate === args.today &&
    args.currentBucket === "now"
  ) {
    return true;
  }
  return args.openNowCountOnToday < cap;
}

/** Count open Now on today after applying reorder placements (partial lanes). */
export function openNowCountAfterPlacements(args: {
  today: string;
  beforeTasks: TaskBeforeNowCap[];
  placements: TaskPlacementForNowCap[];
  cap?: number;
}): number {
  const placementById = new Map(
    args.placements.map((placement) => [placement.taskId, placement]),
  );
  const nowIds = new Set<string>();

  for (const task of args.beforeTasks) {
    if (task.completedAt !== null) {
      continue;
    }
    const placement = placementById.get(task.id);
    const scheduledDate = placement?.scheduledDate ?? task.scheduledDate;
    const bucket = placement?.bucket ?? task.bucket;
    if (isTodaysNowLane(scheduledDate, bucket, args.today)) {
      nowIds.add(task.id);
    }
  }

  return nowIds.size;
}

export function assertOpenNowCountWithinCap(args: {
  today: string;
  beforeTasks: TaskBeforeNowCap[];
  placements: TaskPlacementForNowCap[];
  cap?: number;
}): void {
  const cap = args.cap ?? DEFAULT_NOW_SOFT_CAP;
  const count = openNowCountAfterPlacements(args);
  if (count > cap) {
    throw new NowCapExceededError();
  }
}
