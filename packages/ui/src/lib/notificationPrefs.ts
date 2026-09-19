import type { NotificationPreferences } from "@tudu/shared";
import { defaultNotificationPreferences } from "@tudu/shared";

const STORAGE_KEY = "tudu.notificationPrefs";

/** Client cache of server notification prefs (legacy shape extended). */
export type NotificationPrefs = NotificationPreferences;

export const defaultNotificationPrefs: NotificationPrefs =
  defaultNotificationPreferences();

export function readNotificationPrefs(): NotificationPrefs {
  if (typeof localStorage === "undefined") {
    return defaultNotificationPrefs;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultNotificationPrefs;
    }
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return { ...defaultNotificationPrefs, ...parsed };
  } catch {
    return defaultNotificationPrefs;
  }
}

export function writeNotificationPrefs(prefs: NotificationPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function serverPrefsToLocal(
  prefs: NotificationPreferences,
): NotificationPrefs {
  return { ...prefs };
}
