import type { AppNotification } from "@tudu/shared";
import {
  canDeliverScheduledReminderPush,
  isNotificationKindEnabled,
  isWithinQuietHours,
  SCHEDULED_REMINDER_KINDS,
} from "@tudu/shared";
import type { NotificationPrefs } from "@/lib/notificationPrefs";

function isScheduledReminderKind(kind: string): boolean {
  return (SCHEDULED_REMINDER_KINDS as readonly string[]).includes(kind);
}

type InspectorTabName = "details" | "comments" | "timeline";

function isInboxKind(kind: AppNotification["kind"]): boolean {
  return kind === "inbox" || kind === "inbox_declined";
}

export function shouldAutoReadNotification(args: {
  notification: AppNotification;
  windowFocused: boolean;
  pathname: string;
  selectedTaskId: string | null;
  inspectorTab: InspectorTabName;
}): boolean {
  const { notification } = args;
  if (notification.readAt) {
    return false;
  }
  if (!args.windowFocused) {
    return false;
  }
  if (isInboxKind(notification.kind)) {
    return args.pathname.startsWith("/inbox");
  }
  if (notification.kind !== "comment" || !notification.taskId) {
    return false;
  }
  return (
    args.selectedTaskId === notification.taskId &&
    args.inspectorTab === "comments"
  );
}

export function shouldFireOsBanner(args: {
  notification: AppNotification;
  prefs: NotificationPrefs;
  windowFocused: boolean;
  pathname: string;
  selectedTaskId: string | null;
}): boolean {
  const { notification, prefs } = args;
  if (notification.readAt) {
    return false;
  }
  if (!prefs.osEnabled) {
    return false;
  }
  if (!isNotificationKindEnabled(prefs, notification.kind)) {
    return false;
  }
  if (isScheduledReminderKind(notification.kind)) {
    if (!canDeliverScheduledReminderPush(prefs)) {
      return false;
    }
  } else if (isWithinQuietHours(prefs)) {
    return false;
  }
  if (!args.windowFocused) {
    return true;
  }
  if (isInboxKind(notification.kind) && args.pathname.startsWith("/inbox")) {
    return false;
  }
  if (notification.taskId && args.selectedTaskId === notification.taskId) {
    return false;
  }
  return true;
}
