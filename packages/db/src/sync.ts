import { and, asc, eq, gt, sql } from "drizzle-orm";
import { recipientsForTask, type SyncEvent, type SyncEventType } from "@tudu/shared";
import type { Db } from "./index.js";
import { liveOrgMemberUserIds } from "./access.js";
import { syncEvents, syncMutations } from "./sync-schema.js";
import { tasks } from "./tasks-schema.js";

export type EmitSyncInput = {
  recipientUserIds: string[];
  clientMutationId: string | null;
  type: SyncEventType;
  payload: unknown;
};

export async function recipientsForTaskId(
  db: Db,
  taskId: string,
): Promise<string[]> {
  const row = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: {
      userId: true,
      isPrivate: true,
      orgId: true,
      pendingRequestId: true,
    },
  });
  if (!row) {
    return [];
  }
  if (row.pendingRequestId !== null) {
    return [row.userId];
  }
  if (row.isPrivate || row.orgId === null) {
    return recipientsForTask({
      ownerId: row.userId,
      isPrivate: row.isPrivate,
      managerUserId: null,
    });
  }
  const members = await liveOrgMemberUserIds(db, row.orgId);
  return uniqueIds([row.userId, ...members]);
}

export function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export async function emitSync(
  db: Db,
  input: EmitSyncInput,
): Promise<SyncEvent[]> {
  const recipients = uniqueIds(input.recipientUserIds);
  if (recipients.length === 0) {
    return [];
  }

  const rows = await db
    .insert(syncEvents)
    .values(
      recipients.map((recipientUserId) => ({
        recipientUserId,
        clientMutationId: input.clientMutationId,
        type: input.type,
        payload: input.payload,
      })),
    )
    .returning();

  return rows.map(rowToEvent);
}

export async function emitMany(
  db: Db,
  inputs: EmitSyncInput[],
): Promise<SyncEvent[]> {
  const events: SyncEvent[] = [];
  for (const input of inputs) {
    events.push(...(await emitSync(db, input)));
  }
  return events;
}

export async function listEventsAfter(
  db: Db,
  userId: string,
  afterSeq: number,
  limit = 200,
): Promise<SyncEvent[]> {
  const rows = await db
    .select()
    .from(syncEvents)
    .where(
      and(eq(syncEvents.recipientUserId, userId), gt(syncEvents.id, afterSeq)),
    )
    .orderBy(asc(syncEvents.id))
    .limit(limit);

  return rows.map(rowToEvent);
}

export async function currentSyncSeq(db: Db): Promise<number> {
  const rows = await db
    .select({ maxId: sql<number | string | null>`max(${syncEvents.id})` })
    .from(syncEvents);
  return Number(rows[0]?.maxId ?? 0);
}

export async function claimMutation(
  db: Db,
  userId: string,
  clientMutationId: string,
): Promise<"claimed" | "duplicate"> {
  const rows = await db
    .insert(syncMutations)
    .values({ userId, clientMutationId })
    .onConflictDoNothing()
    .returning({ userId: syncMutations.userId });
  return rows.length > 0 ? "claimed" : "duplicate";
}

export async function releaseMutation(
  db: Db,
  userId: string,
  clientMutationId: string,
): Promise<void> {
  await db
    .delete(syncMutations)
    .where(
      and(
        eq(syncMutations.userId, userId),
        eq(syncMutations.clientMutationId, clientMutationId),
      ),
    );
}

export async function eventsForMutation(
  db: Db,
  userId: string,
  clientMutationId: string,
): Promise<SyncEvent[]> {
  const rows = await db
    .select()
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.recipientUserId, userId),
        eq(syncEvents.clientMutationId, clientMutationId),
      ),
    )
    .orderBy(asc(syncEvents.id));

  return rows.map(rowToEvent);
}

function rowToEvent(row: typeof syncEvents.$inferSelect): SyncEvent {
  return {
    seq: Number(row.id),
    recipientUserId: row.recipientUserId,
    clientMutationId: row.clientMutationId,
    type: row.type as SyncEventType,
    payload: row.payload,
  };
}
