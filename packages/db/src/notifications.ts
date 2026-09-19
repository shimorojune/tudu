import { and, desc, eq, isNull } from "drizzle-orm";
import {
  formatNotificationBody,
  TUDU_SYSTEM_USER_ID,
  type AppNotification,
  type NotificationKind,
  type TaskChangeTimelineType,
} from "@tudu/shared";
import type { Db } from "./index.js";
import { user } from "./auth-schema.js";
import { notifications, type NotificationRow } from "./notifications-schema.js";
import { emitSync, uniqueIds } from "./sync.js";
import type { SyncEvent } from "@tudu/shared";

export function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.userId,
    actorId: row.actorId,
    kind: row.kind,
    taskId: row.taskId,
    ownerId: row.ownerId,
    commentId: row.commentId,
    inboxItemId: row.inboxItemId,
    scheduledDate: row.scheduledDate,
    jiraIssueId: row.jiraIssueId ?? null,
    jiraIssueKey: row.jiraIssueKey ?? null,
    appVersion: row.appVersion ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    taskTitle: row.taskTitle,
    body: row.body,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listNotifications(
  db: Db,
  userId: string,
  limit = 100,
): Promise<AppNotification[]> {
  const rows = await db.query.notifications.findMany({
    where: and(eq(notifications.userId, userId), isNull(notifications.deletedAt)),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });
  return rows.map(mapNotification);
}

export async function markNotificationRead(
  db: Db,
  userId: string,
  id: string,
): Promise<AppNotification | undefined> {
  const existing = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.id, id),
      eq(notifications.userId, userId),
      isNull(notifications.deletedAt),
    ),
  });
  if (!existing) {
    return undefined;
  }
  if (existing.readAt) {
    return mapNotification(existing);
  }
  const readAt = new Date();
  const [updated] = await db
    .update(notifications)
    .set({ readAt })
    .where(eq(notifications.id, id))
    .returning();
  return updated ? mapNotification(updated) : undefined;
}

export async function markAllNotificationsRead(
  db: Db,
  userId: string,
): Promise<Date> {
  const readAt = new Date();
  await db
    .update(notifications)
    .set({ readAt })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.deletedAt),
      ),
    );
  return readAt;
}

export async function lookupUserName(
  db: Db,
  userId: string,
): Promise<string> {
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { name: true },
  });
  return row?.name?.trim() || "Someone";
}

export type InsertNotificationInput = {
  recipientUserIds: string[];
  actorId: string;
  clientMutationId: string | null;
  kind: NotificationKind;
  taskTitle: string;
  commentQuote?: string;
  changeType?: TaskChangeTimelineType;
  taskId?: string | null;
  ownerId?: string | null;
  commentId?: string | null;
  inboxItemId?: string | null;
  scheduledDate?: string | null;
};

export async function insertAndEmitNotifications(
  db: Db,
  input: InsertNotificationInput,
): Promise<SyncEvent[]> {
  const recipients = uniqueIds(input.recipientUserIds).filter(
    (id) => id !== input.actorId,
  );
  const actorName = await lookupUserName(db, input.actorId);
  const body = formatNotificationBody({
    kind: input.kind,
    actorName,
    taskTitle: input.taskTitle,
    commentQuote: input.commentQuote,
    changeType: input.changeType,
  });
  if (!body || recipients.length === 0) {
    return [];
  }

  const rows = await db
    .insert(notifications)
    .values(
      recipients.map((userId) => ({
        userId,
        actorId: input.actorId,
        kind: input.kind,
        taskId: input.taskId ?? null,
        ownerId: input.ownerId ?? null,
        commentId: input.commentId ?? null,
        inboxItemId: input.inboxItemId ?? null,
        scheduledDate: input.scheduledDate ?? null,
        taskTitle: input.taskTitle.trim(),
        body,
      })),
    )
    .returning();

  const events: SyncEvent[] = [];
  for (const row of rows) {
    events.push(
      ...(await emitSync(db, {
        recipientUserIds: [row.userId],
        clientMutationId: input.clientMutationId,
        type: "notification.upsert",
        payload: mapNotification(row),
      })),
    );
  }
  return events;
}

export type InsertSystemNotificationInput = {
  recipientUserIds: string[];
  clientMutationId: string | null;
  kind: NotificationKind;
  body: string;
  taskTitle: string;
  taskId?: string | null;
  ownerId?: string | null;
  scheduledDate?: string | null;
  jiraIssueId?: string | null;
  jiraIssueKey?: string | null;
  appVersion?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function insertSystemNotifications(
  db: Db,
  input: InsertSystemNotificationInput,
): Promise<SyncEvent[]> {
  const recipients = uniqueIds(input.recipientUserIds);
  const body = input.body.trim();
  const taskTitle = input.taskTitle.trim();
  if (!body || !taskTitle || recipients.length === 0) {
    return [];
  }

  const rows = await db
    .insert(notifications)
    .values(
      recipients.map((userId) => ({
        userId,
        actorId: TUDU_SYSTEM_USER_ID,
        kind: input.kind,
        taskId: input.taskId ?? null,
        ownerId: input.ownerId ?? null,
        scheduledDate: input.scheduledDate ?? null,
        jiraIssueId: input.jiraIssueId ?? null,
        jiraIssueKey: input.jiraIssueKey ?? null,
        appVersion: input.appVersion ?? null,
        metadata: input.metadata ?? null,
        taskTitle,
        body,
      })),
    )
    .returning();

  const events: SyncEvent[] = [];
  for (const row of rows) {
    events.push(
      ...(await emitSync(db, {
        recipientUserIds: [row.userId],
        clientMutationId: input.clientMutationId,
        type: "notification.upsert",
        payload: mapNotification(row),
      })),
    );
  }
  return events;
}

export { TUDU_SYSTEM_USER_ID };
