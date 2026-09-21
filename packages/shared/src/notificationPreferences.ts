import { z } from "zod";

export const TUDU_SYSTEM_USER_ID = "tudu-system";

export const DEFAULT_NOTIFICATION_TIMEZONE = "UTC";

export const DEFAULT_QUIET_HOURS_START = "22:00";
export const DEFAULT_QUIET_HOURS_END = "07:00";

export const DEFAULT_JIRA_POLL_ACTIVE_MINUTES = 3;
export const DEFAULT_JIRA_POLL_IDLE_MINUTES = 20;

export const DEFAULT_DIGEST_TIME_LOCAL = "09:00";
export const DEFAULT_LATE_REMINDER_MINUTES = 120;
export const DEFAULT_FOCUS_CHECK_IN_MINUTES = 90;
export const DEFAULT_DEADLINE_NUDGE_HOURS = [24, 4] as const;

export const DEFAULT_WORK_HOURS_START = "09:00";
export const DEFAULT_WORK_HOURS_END = "18:00";
/** ISO weekday: Monday = 1 through Sunday = 7 */
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5] as const;

export const SCHEDULED_REMINDER_KINDS = [
  "reminder_focus",
  "reminder_digest",
  "reminder_late",
  "reminder_deadline",
] as const;

export const JIRA_LINK_MAX_AGE_DAYS = 90;

export const notificationPreferencesSchema = z.object({
  osEnabled: z.boolean(),
  inbox: z.boolean(),
  comments: z.boolean(),
  taskChanges: z.boolean(),
  jira: z.boolean(),
  jiraAssigned: z.boolean(),
  jiraUnassigned: z.boolean(),
  jiraComment: z.boolean(),
  jiraUpdated: z.boolean(),
  reminders: z.boolean(),
  remindersFocus: z.boolean(),
  remindersDigest: z.boolean(),
  remindersDeadline: z.boolean(),
  remindersSlipping: z.boolean(),
  focusCheckInMinutes: z.number().int().min(15).max(720),
  workHoursEnabled: z.boolean(),
  workHoursStart: z.string(),
  workHoursEnd: z.string(),
  workDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  appUpdate: z.boolean(),
  timezone: z.string().min(1),
  quietHoursStart: z.string(),
  quietHoursEnd: z.string(),
  jiraPollActiveMinutes: z.number().int().min(1).max(120),
  jiraPollIdleMinutes: z.number().int().min(1).max(240),
  digestTimeLocal: z.string(),
  lateReminderMinutes: z.number().int().min(15).max(720),
  deadlineNudgeHours: z.array(z.number().int().min(1).max(168)),
  approachingRequiresInProgress: z.boolean(),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const defaultNotificationPreferences = (): NotificationPreferences => ({
  osEnabled: false,
  inbox: true,
  comments: true,
  taskChanges: true,
  jira: true,
  jiraAssigned: true,
  jiraUnassigned: true,
  jiraComment: true,
  jiraUpdated: true,
  reminders: true,
  remindersFocus: true,
  remindersDigest: true,
  remindersDeadline: true,
  remindersSlipping: false,
  focusCheckInMinutes: DEFAULT_FOCUS_CHECK_IN_MINUTES,
  workHoursEnabled: true,
  workHoursStart: DEFAULT_WORK_HOURS_START,
  workHoursEnd: DEFAULT_WORK_HOURS_END,
  workDays: [...DEFAULT_WORK_DAYS],
  appUpdate: true,
  timezone: DEFAULT_NOTIFICATION_TIMEZONE,
  quietHoursStart: DEFAULT_QUIET_HOURS_START,
  quietHoursEnd: DEFAULT_QUIET_HOURS_END,
  jiraPollActiveMinutes: DEFAULT_JIRA_POLL_ACTIVE_MINUTES,
  jiraPollIdleMinutes: DEFAULT_JIRA_POLL_IDLE_MINUTES,
  digestTimeLocal: DEFAULT_DIGEST_TIME_LOCAL,
  lateReminderMinutes: DEFAULT_LATE_REMINDER_MINUTES,
  deadlineNudgeHours: [...DEFAULT_DEADLINE_NUDGE_HOURS],
  approachingRequiresInProgress: true,
});

export type NotificationPreferencesResponse = NotificationPreferences & {
  lastActiveAt: string | null;
  lastJiraPollAt: string | null;
  clientAppVersion: string | null;
};

export const notificationPreferencesUpdateSchema =
  notificationPreferencesSchema.partial();

export type NotificationPreferencesUpdate = z.infer<
  typeof notificationPreferencesUpdateSchema
>;

/** True when all activity event channels are enabled together. */
export function deriveActivityEnabled(prefs: NotificationPreferences): boolean {
  return (
    prefs.inbox &&
    prefs.comments &&
    prefs.taskChanges &&
    prefs.jira &&
    prefs.jiraAssigned &&
    prefs.jiraUnassigned &&
    prefs.jiraComment &&
    prefs.jiraUpdated
  );
}

export function applyActivityEnabled(
  prefs: NotificationPreferences,
  enabled: boolean,
): NotificationPreferences {
  return {
    ...prefs,
    inbox: enabled,
    comments: enabled,
    taskChanges: enabled,
    jira: enabled,
    jiraAssigned: enabled,
    jiraUnassigned: enabled,
    jiraComment: enabled,
    jiraUpdated: enabled,
  };
}

export function applyRemindersEnabled(
  prefs: NotificationPreferences,
  enabled: boolean,
): NotificationPreferences {
  return {
    ...prefs,
    reminders: enabled,
    remindersFocus: enabled,
    remindersDigest: enabled,
    remindersDeadline: enabled,
    remindersSlipping: enabled,
  };
}

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
  const activity = deriveActivityEnabled(prefs);
  switch (kind) {
    case "inbox":
    case "inbox_declined":
    case "comment":
    case "task_changed":
    case "task_deleted":
    case "jira_assigned":
    case "jira_unassigned":
    case "jira_comment":
    case "jira_updated":
      return activity;
    case "reminder_focus":
    case "reminder_digest":
    case "reminder_late":
    case "reminder_deadline":
      return prefs.reminders;
    case "app_update":
      return prefs.appUpdate;
    default:
      return true;
  }
}
