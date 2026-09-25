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
  return notificationPreferencesSchema.parse({
    osEnabled: row.osEnabled,
    regularEnabled: row.regularEnabled,
    regularIntervalMinutes: row.regularIntervalMinutes,
    workHoursStart: row.workHoursStart,
    workHoursEnd: row.workHoursEnd,
    workDays: Array.isArray(row.workDays) ? row.workDays : [1, 2, 3, 4, 5],
    eventsEnabled: row.eventsEnabled,
    eventsJira: row.eventsJira,
    eventsInbox: row.eventsInbox,
    eventsComments: row.eventsComments,
    timezone: row.timezone,
    jiraPollActiveMinutes: row.jiraPollActiveMinutes,
    jiraPollIdleMinutes: row.jiraPollIdleMinutes,
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
      osEnabled: defaults.osEnabled,
      regularEnabled: defaults.regularEnabled,
      regularIntervalMinutes: defaults.regularIntervalMinutes,
      workHoursStart: defaults.workHoursStart,
      workHoursEnd: defaults.workHoursEnd,
      workDays: defaults.workDays,
      eventsEnabled: defaults.eventsEnabled,
      eventsJira: defaults.eventsJira,
      eventsInbox: defaults.eventsInbox,
      eventsComments: defaults.eventsComments,
      timezone: defaults.timezone,
      jiraPollActiveMinutes: defaults.jiraPollActiveMinutes,
      jiraPollIdleMinutes: defaults.jiraPollIdleMinutes,
      nextJiraPollAt: new Date(),
      nextRegularAt: new Date(),
      nextVersionCheckAt: new Date(),
    })
    .returning();
  return mapNotificationPreferencesResponse(row!);
}

const REGULAR_SCHEDULE_KEYS: (keyof NotificationPreferences)[] = [
  "regularEnabled",
  "regularIntervalMinutes",
  "workHoursStart",
  "workHoursEnd",
  "workDays",
  "timezone",
];

export function shouldResetRegularSchedule(
  patch: NotificationPreferencesUpdate,
): boolean {
  return REGULAR_SCHEDULE_KEYS.some((key) => patch[key] !== undefined);
}

export async function updateNotificationPreferences(
  db: Db,
  userId: string,
  patch: NotificationPreferencesUpdate,
): Promise<NotificationPreferencesResponse> {
  await ensureNotificationPreferences(db, userId);
  const resetRegular = shouldResetRegularSchedule(patch);
  const [row] = await db
    .update(notificationPreferences)
    .set({
      ...patch,
      ...(resetRegular ? { nextRegularAt: null } : {}),
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

export async function listUsersDueForRegular(
  db: Db,
  now: Date,
  limit: number,
): Promise<NotificationPreferencesRow[]> {
  return db
    .select()
    .from(notificationPreferences)
    .where(
      or(
        isNull(notificationPreferences.nextRegularAt),
        lte(notificationPreferences.nextRegularAt, now),
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

export async function scheduleNextRegular(
  db: Db,
  userId: string,
  at: Date,
): Promise<void> {
  await db
    .update(notificationPreferences)
    .set({ nextRegularAt: at })
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

/** @deprecated Use listUsersDueForRegular */
export const listUsersDueForReminderCheck = listUsersDueForRegular;

/** @deprecated Use scheduleNextRegular */
export const scheduleNextReminderCheck = scheduleNextRegular;
