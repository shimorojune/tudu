import { z } from "zod";
import { eventSourceForKind } from "./notifications.js";

export const TUDU_SYSTEM_USER_ID = "tudu-system";

export const DEFAULT_NOTIFICATION_TIMEZONE = "UTC";

export const DEFAULT_JIRA_POLL_ACTIVE_MINUTES = 3;
export const DEFAULT_JIRA_POLL_IDLE_MINUTES = 20;

export const JIRA_LINK_MAX_AGE_DAYS = 90;

export const DEFAULT_WORK_HOURS_START = "09:00";
export const DEFAULT_WORK_HOURS_END = "18:00";
/** ISO weekday: Monday = 1 through Sunday = 7 */
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5] as const;

export const REGULAR_INTERVAL_MINUTES = [15, 30, 60, 120] as const;

export type RegularIntervalMinutes = (typeof REGULAR_INTERVAL_MINUTES)[number];

const hmRegex = /^(\d{1,2}):(\d{2})$/;

function parseHmForSchema(value: string): { hour: number; minute: number } | null {
  const match = hmRegex.exec(value.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function hmToMinutes(value: string): number | null {
  const parsed = parseHmForSchema(value);
  if (!parsed) {
    return null;
  }
  return parsed.hour * 60 + parsed.minute;
}

const workHoursStartSchema = z
  .string()
  .refine((value) => parseHmForSchema(value) !== null, "Expected HH:MM");

const workHoursEndSchema = z
  .string()
  .refine((value) => parseHmForSchema(value) !== null, "Expected HH:MM");

const notificationPreferencesBaseSchema = z.object({
  osEnabled: z.boolean(),
  regularEnabled: z.boolean(),
  regularIntervalMinutes: z.union([
    z.literal(15),
    z.literal(30),
    z.literal(60),
    z.literal(120),
  ]),
  workHoursStart: workHoursStartSchema,
  workHoursEnd: workHoursEndSchema,
  workDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  eventsEnabled: z.boolean(),
  eventsJira: z.boolean(),
  eventsInbox: z.boolean(),
  eventsComments: z.boolean(),
  timezone: z.string().min(1),
  jiraPollActiveMinutes: z.number().int().min(1).max(120),
  jiraPollIdleMinutes: z.number().int().min(1).max(240),
});

function refineWorkHours<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((prefs, ctx) => {
    const value = prefs as NotificationPreferences;
    const start = hmToMinutes(value.workHoursStart);
    const end = hmToMinutes(value.workHoursEnd);
    if (start === null || end === null) {
      return;
    }
    if (start >= end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Work hours start must be before end",
        path: ["workHoursStart"],
      });
    }
  });
}

export const notificationPreferencesSchema = refineWorkHours(
  notificationPreferencesBaseSchema,
);

export type NotificationPreferences = z.infer<typeof notificationPreferencesBaseSchema>;

export const defaultNotificationPreferences = (): NotificationPreferences => ({
  osEnabled: false,
  regularEnabled: true,
  regularIntervalMinutes: 60,
  workHoursStart: DEFAULT_WORK_HOURS_START,
  workHoursEnd: DEFAULT_WORK_HOURS_END,
  workDays: [...DEFAULT_WORK_DAYS],
  eventsEnabled: true,
  eventsJira: true,
  eventsInbox: true,
  eventsComments: true,
  timezone: DEFAULT_NOTIFICATION_TIMEZONE,
  jiraPollActiveMinutes: DEFAULT_JIRA_POLL_ACTIVE_MINUTES,
  jiraPollIdleMinutes: DEFAULT_JIRA_POLL_IDLE_MINUTES,
});

export type NotificationPreferencesResponse = NotificationPreferences & {
  lastActiveAt: string | null;
  lastJiraPollAt: string | null;
  clientAppVersion: string | null;
};

export const notificationPreferencesUpdateSchema =
  notificationPreferencesBaseSchema.partial();

export type NotificationPreferencesUpdate = z.infer<
  typeof notificationPreferencesUpdateSchema
>;

export function resolveClientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_NOTIFICATION_TIMEZONE;
  } catch {
    return DEFAULT_NOTIFICATION_TIMEZONE;
  }
}

export function isNotificationKindEnabled(
  prefs: NotificationPreferences,
  kind: string,
): boolean {
  if (!prefs.eventsEnabled) {
    return false;
  }
  const source = eventSourceForKind(kind);
  switch (source) {
    case "jira":
      return prefs.eventsJira;
    case "inbox":
      return prefs.eventsInbox;
    case "comments":
      return prefs.eventsComments;
    case "other":
      return true;
    default:
      return true;
  }
}

export function nearestRegularIntervalMinutes(
  minutes: number,
): RegularIntervalMinutes {
  let best: RegularIntervalMinutes = REGULAR_INTERVAL_MINUTES[0];
  let bestDist = Math.abs(minutes - best);
  for (const option of REGULAR_INTERVAL_MINUTES) {
    const dist = Math.abs(minutes - option);
    if (dist < bestDist) {
      best = option;
      bestDist = dist;
    }
  }
  return best;
}
