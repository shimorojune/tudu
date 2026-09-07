import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import { BUCKETS, carriedDaysBetween, type Bucket } from "@tudu/shared";
import type { Db } from "./index.js";
import { timelineEvents } from "./activity-schema.js";
import { tasks, type TaskRow } from "./tasks-schema.js";

export type RolloverCandidate = {
  id: string;
  scheduledDate: string;
  bucket: Bucket;
  position: number;
  carriedSince: string | null;
};

export type RolloverPlacement = {
  taskId: string;
  scheduledDate: string;
  bucket: Bucket;
  position: number;
  carriedDays: number;
  carriedSince: string;
  fromDate: string;
};

/** Groups candidates by bucket, sorts by old date then position, assigns top slots. */
export function planRolloverPlacements(args: {
  candidates: RolloverCandidate[];
  toDate: string;
}): RolloverPlacement[] {
  const byBucket = new Map<Bucket, RolloverCandidate[]>();

  for (const candidate of args.candidates) {
    const group = byBucket.get(candidate.bucket) ?? [];
    group.push(candidate);
    byBucket.set(candidate.bucket, group);
  }

  const placements: RolloverPlacement[] = [];

  for (const bucket of BUCKETS) {
    const group = byBucket.get(bucket);
    if (!group || group.length === 0) {
      continue;
    }

    group.sort((a, b) => {
      if (a.scheduledDate !== b.scheduledDate) {
        return a.scheduledDate.localeCompare(b.scheduledDate);
      }
      return a.position - b.position;
    });

    group.forEach((candidate, index) => {
      const carriedSince = candidate.carriedSince ?? candidate.scheduledDate;
      placements.push({
        taskId: candidate.id,
        scheduledDate: args.toDate,
        bucket,
        position: index,
        carriedDays: carriedDaysBetween(carriedSince, args.toDate),
        carriedSince,
        fromDate: candidate.scheduledDate,
      });
    });
  }

  return placements;
}

export type RolloverResult = {
  movedCount: number;
  taskIds: string[];
};

export async function rollOverTasks(
  db: Db,
  userId: string,
  toDate: string,
): Promise<RolloverResult> {
  const candidates = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      isNull(tasks.completedAt),
      lt(tasks.scheduledDate, toDate),
    ),
    orderBy: [asc(tasks.scheduledDate), asc(tasks.position)],
  });

  const eligible = candidates.filter(
    (row): row is TaskRow & { scheduledDate: string; bucket: Bucket } =>
      row.scheduledDate !== null && row.bucket !== null,
  );

  if (eligible.length === 0) {
    return { movedCount: 0, taskIds: [] };
  }

  const rolloverCandidates: RolloverCandidate[] = eligible.map((row) => ({
    id: row.id,
    scheduledDate: row.scheduledDate,
    bucket: row.bucket,
    position: row.position,
    carriedSince: row.carriedSince,
  }));

  const placements = planRolloverPlacements({
    candidates: rolloverCandidates,
    toDate,
  });

  const incomingByBucket = new Map<Bucket, number>();
  for (const placement of placements) {
    incomingByBucket.set(
      placement.bucket,
      (incomingByBucket.get(placement.bucket) ?? 0) + 1,
    );
  }

  const batchOps = [];

  for (const bucket of BUCKETS) {
    const count = incomingByBucket.get(bucket) ?? 0;
    if (count === 0) {
      continue;
    }

    batchOps.push(
      db
        .update(tasks)
        .set({ position: sql`${tasks.position} + ${count}` })
        .where(
          and(
            eq(tasks.userId, userId),
            isNull(tasks.deletedAt),
            eq(tasks.scheduledDate, toDate),
            eq(tasks.bucket, bucket),
          ),
        ),
    );
  }

  for (const placement of placements) {
    batchOps.push(
      db
        .update(tasks)
        .set({
          scheduledDate: placement.scheduledDate,
          bucket: placement.bucket,
          position: placement.position,
          carriedDays: placement.carriedDays,
          carriedSince: placement.carriedSince,
        })
        .where(
          and(eq(tasks.id, placement.taskId), eq(tasks.userId, userId)),
        ),
    );

    batchOps.push(
      db.insert(timelineEvents).values({
        taskId: placement.taskId,
        actorId: null,
        type: "rolled_over",
        data: {
          from: placement.fromDate,
          to: placement.scheduledDate,
          carriedDays: placement.carriedDays,
        },
      }),
    );
  }

  if (batchOps.length > 0) {
    const [first, ...rest] = batchOps;
    await db.batch([first, ...rest]);
  }

  return {
    movedCount: placements.length,
    taskIds: placements.map((placement) => placement.taskId),
  };
}
