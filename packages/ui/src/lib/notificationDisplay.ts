import type { AppNotification } from "@tudu/shared";
import {
  parseNotificationPresentation,
  type NotificationPresentation,
} from "@tudu/shared";

export function resolveNotificationPresentation(
  item: AppNotification,
): NotificationPresentation {
  const fromMeta = parseNotificationPresentation(item.metadata, item.body);
  if (fromMeta) {
    return fromMeta;
  }
  return {
    title: item.taskTitle || "Tudu",
    lines: item.body ? [item.body] : [],
  };
}

export function osNotificationFromItem(item: AppNotification): {
  title: string;
  body: string;
  tag: string;
} {
  const presentation = resolveNotificationPresentation(item);
  const body =
    presentation.summary ??
    (presentation.lines.length > 0
      ? presentation.lines.join("\n")
      : presentation.title);
  return {
    title: presentation.title,
    body,
    tag: item.kind,
  };
}
