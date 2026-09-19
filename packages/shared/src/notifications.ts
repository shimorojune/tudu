export const NOTIFICATION_KINDS = [
  "inbox",
  "comment",
  "task_changed",
  "task_deleted",
  "inbox_declined",
  "jira_assigned",
  "jira_unassigned",
  "jira_comment",
  "jira_updated",
  "reminder_digest",
  "reminder_late",
  "reminder_deadline",
  "app_update",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const TASK_CHANGE_TIMELINE_TYPES = [
  "renamed",
  "description_changed",
  "deadline_changed",
  "moved",
  "rescheduled",
] as const;

export type TaskChangeTimelineType = (typeof TASK_CHANGE_TIMELINE_TYPES)[number];

export type AppNotification = {
  id: string;
  userId: string;
  actorId: string;
  kind: NotificationKind;
  taskId: string | null;
  ownerId: string | null;
  commentId: string | null;
  inboxItemId: string | null;
  scheduledDate: string | null;
  jiraIssueId: string | null;
  jiraIssueKey: string | null;
  appVersion: string | null;
  metadata: Record<string, unknown> | null;
  taskTitle: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

const TITLE_MAX = 48;
const QUOTE_MAX = 80;

export function clipNotificationText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, max - 3))}...`;
}

export function notificationActorLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Someone";
  }
  return trimmed.split(/\s+/)[0]!;
}

export function isTaskChangeTimelineType(
  type: string,
): type is TaskChangeTimelineType {
  return (TASK_CHANGE_TIMELINE_TYPES as readonly string[]).includes(type);
}

export function formatNotificationBody(args: {
  kind: NotificationKind;
  actorName: string;
  taskTitle: string;
  commentQuote?: string;
  changeType?: TaskChangeTimelineType;
}): string | null {
  const title = clipNotificationText(args.taskTitle, TITLE_MAX);
  if (!title) {
    return null;
  }

  const name = notificationActorLabel(args.actorName);

  switch (args.kind) {
    case "inbox":
      return `${name} sent you a task: ${title}`;
    case "inbox_declined": {
      const quote = clipNotificationText(args.commentQuote ?? "", QUOTE_MAX);
      if (!quote) {
        return `${name} declined ${title}`;
      }
      return `${name} declined ${title}: ${quote}`;
    }
    case "comment": {
      const quote = clipNotificationText(args.commentQuote ?? "", QUOTE_MAX);
      if (!quote) {
        return `${name} commented on ${title}`;
      }
      return `${name} commented on ${title}: ${quote}`;
    }
    case "task_deleted":
      return `${name} deleted ${title}`;
    case "task_changed": {
      switch (args.changeType) {
        case "renamed":
          return `${name} renamed ${title}`;
        case "description_changed":
          return `${name} updated the description of ${title}`;
        case "deadline_changed":
          return `${name} set the deadline on ${title}`;
        case "moved":
          return `${name} moved ${title}`;
        case "rescheduled":
          return `${name} rescheduled ${title}`;
        default:
          return `${name} changed ${title}`;
      }
    }
    case "jira_assigned":
      return `You were assigned ${title}`;
    case "jira_unassigned":
      return `You were unassigned from ${title}`;
    case "jira_comment":
      return `New comment on ${title}`;
    case "jira_updated":
      return `${title} was updated in JIRA`;
    case "reminder_digest":
      return args.taskTitle;
    case "reminder_late":
      return args.taskTitle;
    case "reminder_deadline":
      return args.taskTitle;
    case "app_update":
      return args.taskTitle;
    default:
      return null;
  }
}
