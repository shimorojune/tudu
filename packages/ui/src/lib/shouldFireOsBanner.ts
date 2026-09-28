import type { AppNotification } from "@tudu/shared";
import { isNotificationKindEnabled } from "@tudu/shared";
import type { NotificationPrefs } from "@/lib/notificationPrefs";

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
    return args.pathname.startsWith("/unscheduled");
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
  if (!args.windowFocused) {
    return true;
  }
  if (isInboxKind(notification.kind) && args.pathname.startsWith("/unscheduled")) {
    return false;
  }
  if (notification.taskId && args.selectedTaskId === notification.taskId) {
    return false;
  }
  return true;
}
