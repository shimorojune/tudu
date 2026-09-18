import type { Db, InsertNotificationInput } from "@tudu/db";
import { insertAndEmitNotifications } from "@tudu/db";
import type { AppNotification, SyncEvent } from "@tudu/shared";

function notificationsFromEvents(events: SyncEvent[]): AppNotification[] {
  const rows: AppNotification[] = [];
  for (const event of events) {
    if (event.type === "notification.upsert") {
      rows.push(event.payload as AppNotification);
    }
  }
  return rows;
}

export async function insertAndEmitNotificationsWithPush(
  db: Db,
  input: InsertNotificationInput,
): Promise<SyncEvent[]> {
  const events = await insertAndEmitNotifications(db, input);
  const created = notificationsFromEvents(events);
  if (created.length > 0 && process.env.FCM_SERVICE_ACCOUNT_JSON?.trim()) {
    void import("./push/fcm.js")
      .then(({ sendWebPushForNotifications }) =>
        sendWebPushForNotifications(db, created),
      )
      .catch((error) => {
        console.error("[fcm] send failed", error);
      });
  }
  return events;
}
