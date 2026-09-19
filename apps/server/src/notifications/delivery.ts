import type { Db, InsertSystemNotificationInput } from "@tudu/db";
import {
  getNotificationPreferences,
  insertSystemNotifications,
} from "@tudu/db";
import type { AppNotification, SyncEvent } from "@tudu/shared";
import { shouldSendPushForNotification } from "@tudu/shared";

function notificationsFromEvents(events: SyncEvent[]): AppNotification[] {
  const rows: AppNotification[] = [];
  for (const event of events) {
    if (event.type === "notification.upsert") {
      rows.push(event.payload as AppNotification);
    }
  }
  return rows;
}

export async function insertSystemNotificationsWithPush(
  db: Db,
  input: InsertSystemNotificationInput,
): Promise<SyncEvent[]> {
  const events = await insertSystemNotifications(db, input);
  const created = notificationsFromEvents(events);
  if (created.length === 0 || !process.env.FCM_SERVICE_ACCOUNT_JSON?.trim()) {
    return events;
  }

  const pushRows: AppNotification[] = [];
  for (const row of created) {
    const prefs = await getNotificationPreferences(db, row.userId);
    if (!prefs) {
      continue;
    }
    if (shouldSendPushForNotification(prefs, row.kind)) {
      pushRows.push(row);
    }
  }

  if (pushRows.length > 0) {
    void import("../push/fcm.js")
      .then(({ sendWebPushForNotifications }) =>
        sendWebPushForNotifications(db, pushRows),
      )
      .catch((error) => {
        console.error("[fcm] send failed", error);
      });
  }

  return events;
}

export async function insertAndEmitNotificationsWithPush(
  db: Db,
  input: import("@tudu/db").InsertNotificationInput,
): Promise<SyncEvent[]> {
  const { insertAndEmitNotifications } = await import("@tudu/db");
  const events = await insertAndEmitNotifications(db, input);
  const created = notificationsFromEvents(events);
  if (created.length === 0 || !process.env.FCM_SERVICE_ACCOUNT_JSON?.trim()) {
    return events;
  }

  const pushRows: AppNotification[] = [];
  for (const row of created) {
    const prefs = await getNotificationPreferences(db, row.userId);
    if (!prefs) {
      continue;
    }
    if (shouldSendPushForNotification(prefs, row.kind)) {
      pushRows.push(row);
    }
  }

  if (pushRows.length > 0) {
    void import("../push/fcm.js")
      .then(({ sendWebPushForNotifications }) =>
        sendWebPushForNotifications(db, pushRows),
      )
      .catch((error) => {
        console.error("[fcm] send failed", error);
      });
  }

  return events;
}
