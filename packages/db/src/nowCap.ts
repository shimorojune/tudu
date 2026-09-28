import {
  calendarDayIso,
  canPlaceInNow,
  countOpenNowOnDate,
  NowCapExceededError,
  type Bucket,
} from "@tudu/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "./index.js";
import { tasks, type TaskRow } from "./tasks-schema.js";

export { NowCapExceededError };

type NowCapCountRow = {
  id: string;
  scheduledDate: string | null;
  bucket: Bucket | null;
  completedAt: Date | null;
};

function taskBeforeCap(row: NowCapCountRow) {
  return {
    id: row.id,
    scheduledDate: row.scheduledDate,
    bucket: row.bucket,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function countOpenNowForUserOnDate(
  db: Db,
  userId: string,
  date: string,
  orgId?: string | null,
): Promise<number> {
  const orgClause =
    orgId === undefined
      ? undefined
      : orgId === null
        ? isNull(tasks.orgId)
        : eq(tasks.orgId, orgId);

  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, userId),
      eq(tasks.scheduledDate, date),
      eq(tasks.bucket, "now"),
      isNull(tasks.completedAt),
      isNull(tasks.deletedAt),
      isNull(tasks.pendingRequestId),
      orgClause,
    ),
    columns: {
      id: true,
      scheduledDate: true,
      bucket: true,
      completedAt: true,
    },
  });
  return countOpenNowOnDate(rows.map(taskBeforeCap), date);
}

export async function assertNowCapForCreate(
  db: Db,
  userId: string,
  scheduledDate: string | null,
  bucket: Bucket | null,
  orgId: string | null = null,
): Promise<void> {
  const today = calendarDayIso();
  if (scheduledDate !== today || bucket !== "now") {
    return;
  }
  if (orgId === null) {
    return;
  }
  const openNowCount = await countOpenNowForUserOnDate(
    db,
    userId,
    today,
    orgId,
  );
  if (
    !canPlaceInNow({
      today,
      targetDate: scheduledDate,
      targetBucket: bucket,
      openNowCountOnToday: openNowCount,
    })
  ) {
    throw new NowCapExceededError();
  }
}

export async function assertNowCapForUpdate(
  db: Db,
  userId: string,
  existing: TaskRow,
  scheduledDate: string | null,
  bucket: Bucket | null,
): Promise<void> {
  const today = calendarDayIso();
  if (existing.orgId === null) {
    return;
  }
  const openNowCount = await countOpenNowForUserOnDate(
    db,
    userId,
    today,
    existing.orgId,
  );
  if (
    !canPlaceInNow({
      today,
      targetDate: scheduledDate,
      targetBucket: bucket,
      openNowCountOnToday: openNowCount,
      currentScheduledDate: existing.scheduledDate,
      currentBucket: existing.bucket,
    })
  ) {
    throw new NowCapExceededError();
  }
}
