import { eq, isNull, lte, or } from "drizzle-orm";
import {
  defaultNotificationPreferences,
  type NotificationPreferences,
  type NotificationPreferencesResponse,
  type NotificationPreferencesUpdate,
  notificationPreferencesSchema,
} from "@tudu/shared";
import type { Db } from "./index.js";
import {
  notificationPreferences,
  type NotificationPreferencesRow,
} from "./notification-preferences-schema.js";

function mapRow(row: NotificationPreferencesRow): NotificationPreferences {
  const deadlineNudgeHours = Array.isArray(row.deadlineNudgeHours)
    ? row.deadlineNudgeHours
    : [24, 4];
  return notificationPreferencesSchema.parse({
    osEnabled: row.osEnabled,
    inbox: row.inbox,
    comments: row.comments,
    taskChanges: row.taskChanges,
    jira: row.jira,
    jiraAssigned: row.jiraAssigned,
    jiraUnassigned: row.jiraUnassigned,
    jiraComment: row.jiraComment,
    jiraUpdated: row.jiraUpdated,
    reminders: row.reminders,
    appUpdate: row.appUpdate,
    timezone: row.timezone,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    jiraPollActiveMinutes: row.jiraPollActiveMinutes,
    jiraPollIdleMinutes: row.jiraPollIdleMinutes,
    digestTimeLocal: row.digestTimeLocal,
    lateReminderMinutes: row.lateReminderMinutes,
    deadlineNudgeHours,
    approachingRequiresInProgress: row.approachingRequiresInProgress,
  });
}

export function mapNotificationPreferencesResponse(
  row: NotificationPreferencesRow,
): NotificationPreferencesResponse {
  return {
    ...mapRow(row),
    lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    lastJiraPollAt: row.lastJiraPollAt?.toISOString() ?? null,
    clientAppVersion: row.clientAppVersion,
  };
}

export async function getNotificationPreferences(
  db: Db,
  userId: string,
): Promise<NotificationPreferencesResponse | undefined> {
  const row = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, userId),
  });
  return row ? mapNotificationPreferencesResponse(row) : undefined;
}

export async function ensureNotificationPreferences(
  db: Db,
  userId: string,
  seed?: Partial<NotificationPreferences>,
): Promise<NotificationPreferencesResponse> {
  const existing = await getNotificationPreferences(db, userId);
  if (existing) {
    return existing;
  }
  const defaults = { ...defaultNotificationPreferences(), ...seed };
  const [row] = await db
    .insert(notificationPreferences)
    .values({
      userId,
      ...defaults,
      deadlineNudgeHours: defaults.deadlineNudgeHours,
      nextJiraPollAt: new Date(),
      nextReminderCheckAt: new Date(),
      nextVersionCheckAt: new Date(),
    })
    .returning();
  return mapNotificationPreferencesResponse(row!);
}

export async function updateNotificationPreferences(
  db: Db,
  userId: string,
  patch: NotificationPreferencesUpdate,
): Promise<NotificationPreferencesResponse> {
  await ensureNotificationPreferences(db, userId);
  const [row] = await db
    .update(notificationPreferences)
    .set({
      ...patch,
      deadlineNudgeHours: patch.deadlineNudgeHours,
    })
    .where(eq(notificationPreferences.userId, userId))
    .returning();
  return mapNotificationPreferencesResponse(row!);
}

export async function touchUserLastActive(
  db: Db,
  userId: string,
  at: Date = new Date(),
): Promise<void> {
  await ensureNotificationPreferences(db, userId);
  await db
    .update(notificationPreferences)
    .set({ lastActiveAt: at })
    .where(eq(notificationPreferences.userId, userId));
}

export async function setClientAppVersion(
  db: Db,
  userId: string,
  version: string,
): Promise<void> {
  await ensureNotificationPreferences(db, userId);
  await db
    .update(notificationPreferences)
    .set({ clientAppVersion: version })
    .where(eq(notificationPreferences.userId, userId));
}

export async function listUsersDueForJiraPoll(
  db: Db,
  now: Date,
  limit: number,
): Promise<NotificationPreferencesRow[]> {
  return db
    .select()
    .from(notificationPreferences)
    .where(
      or(
        isNull(notificationPreferences.nextJiraPollAt),
        lte(notificationPreferences.nextJiraPollAt, now),
      ),
    )
    .limit(limit);
}

export async function listUsersDueForReminderCheck(
  db: Db,
  now: Date,
  limit: number,
): Promise<NotificationPreferencesRow[]> {
  return db
    .select()
    .from(notificationPreferences)
    .where(
      or(
        isNull(notificationPreferences.nextReminderCheckAt),
        lte(notificationPreferences.nextReminderCheckAt, now),
      ),
    )
    .limit(limit);
}

export async function listUsersDueForVersionCheck(
  db: Db,
  now: Date,
  limit: number,
): Promise<NotificationPreferencesRow[]> {
  return db
    .select()
    .from(notificationPreferences)
    .where(
      or(
        isNull(notificationPreferences.nextVersionCheckAt),
        lte(notificationPreferences.nextVersionCheckAt, now),
      ),
    )
    .limit(limit);
}

export async function scheduleNextJiraPoll(
  db: Db,
  userId: string,
  at: Date,
  polledAt: Date,
): Promise<void> {
  await db
    .update(notificationPreferences)
    .set({
      nextJiraPollAt: at,
      lastJiraPollAt: polledAt,
    })
    .where(eq(notificationPreferences.userId, userId));
}

export async function scheduleNextReminderCheck(
  db: Db,
  userId: string,
  at: Date,
): Promise<void> {
  await db
    .update(notificationPreferences)
    .set({ nextReminderCheckAt: at })
    .where(eq(notificationPreferences.userId, userId));
}

export async function scheduleNextVersionCheck(
  db: Db,
  userId: string,
  at: Date,
): Promise<void> {
  await db
    .update(notificationPreferences)
    .set({ nextVersionCheckAt: at })
    .where(eq(notificationPreferences.userId, userId));
}
