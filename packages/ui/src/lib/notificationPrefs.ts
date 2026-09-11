const STORAGE_KEY = "tudu.notificationPrefs";

export type NotificationPrefs = {
  osEnabled: boolean;
  inbox: boolean;
  comments: boolean;
  taskChanges: boolean;
};

export const defaultNotificationPrefs: NotificationPrefs = {
  osEnabled: false,
  inbox: true,
  comments: true,
  taskChanges: true,
};

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
    return {
      osEnabled: parsed.osEnabled === true,
      inbox: parsed.inbox !== false,
      comments: parsed.comments !== false,
      taskChanges: parsed.taskChanges !== false,
    };
  } catch {
    return defaultNotificationPrefs;
  }
}

export function writeNotificationPrefs(prefs: NotificationPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
