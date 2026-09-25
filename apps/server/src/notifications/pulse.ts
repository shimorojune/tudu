import { randomUUID } from "node:crypto";
import type { Db } from "@tudu/db";
import { emitSync, getNotificationPreferences } from "@tudu/db";
import type { NotificationPresentation, NotificationPulse, SyncEvent } from "@tudu/shared";
import { presentationOsBody } from "@tudu/shared";

export async function emitRegularPulse(
  db: Db,
  args: {
    userId: string;
    presentation: NotificationPresentation;
    sentAt?: Date;
  },
): Promise<SyncEvent[]> {
  const sentAt = args.sentAt ?? new Date();
  const pulse: NotificationPulse = {
    id: randomUUID(),
    kind: "regular",
    presentation: args.presentation,
    sentAt: sentAt.toISOString(),
  };
  const events = await emitSync(db, {
    recipientUserIds: [args.userId],
    clientMutationId: null,
    type: "notification.pulse",
    payload: pulse,
  });

  const prefs = await getNotificationPreferences(db, args.userId);
  if (prefs?.osEnabled && process.env.FCM_SERVICE_ACCOUNT_JSON?.trim()) {
    void import("../push/fcm.js")
      .then(({ sendWebPushPulse }) =>
        sendWebPushPulse(db, {
          userId: args.userId,
          title: args.presentation.title,
          body: presentationOsBody(args.presentation),
        }),
      )
      .catch((error) => {
        console.error("[fcm] pulse send failed", error);
      });
  }

  return events;
}
