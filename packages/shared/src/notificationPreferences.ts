import { z } from "zod";

export const TUDU_SYSTEM_USER_ID = "tudu-system";

export const DEFAULT_NOTIFICATION_TIMEZONE = "UTC";

export const DEFAULT_QUIET_HOURS_START = "22:00";
export const DEFAULT_QUIET_HOURS_END = "07:00";

export const DEFAULT_JIRA_POLL_ACTIVE_MINUTES = 3;
export const DEFAULT_JIRA_POLL_IDLE_MINUTES = 20;

export const DEFAULT_DIGEST_TIME_LOCAL = "09:00";
export const DEFAULT_LATE_REMINDER_MINUTES = 120;
export const DEFAULT_DEADLINE_NUDGE_HOURS = [24, 4] as const;

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

export function isNotificationKindEnabled(
  prefs: NotificationPreferences,
  kind: string,
): boolean {
  switch (kind) {
    case "inbox":
      return prefs.inbox;
    case "inbox_declined":
      return prefs.inbox;
    case "comment":
      return prefs.comments;
    case "task_changed":
    case "task_deleted":
      return prefs.taskChanges;
    case "jira_assigned":
      return prefs.jira && prefs.jiraAssigned;
    case "jira_unassigned":
      return prefs.jira && prefs.jiraUnassigned;
    case "jira_comment":
      return prefs.jira && prefs.jiraComment;
    case "jira_updated":
      return prefs.jira && prefs.jiraUpdated;
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
