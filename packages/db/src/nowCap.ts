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

function taskBeforeCap(row: TaskRow) {
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
): Promise<number> {
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, userId),
      eq(tasks.scheduledDate, date),
      eq(tasks.bucket, "now"),
      isNull(tasks.completedAt),
      isNull(tasks.deletedAt),
    ),
    columns: {
      id: true,
      scheduledDate: true,
      bucket: true,
      completedAt: true,
    },
  });
  return countOpenNowOnDate(rows, date);
}

export async function assertNowCapForCreate(
  db: Db,
  userId: string,
  scheduledDate: string | null,
  bucket: Bucket | null,
): Promise<void> {
  const today = calendarDayIso();
  if (scheduledDate !== today || bucket !== "now") {
    return;
  }
  const openNowCount = await countOpenNowForUserOnDate(db, userId, today);
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
  const openNowCount = await countOpenNowForUserOnDate(db, userId, today);
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
