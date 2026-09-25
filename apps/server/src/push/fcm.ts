import type { AppNotification } from "@tudu/shared";
import type { Db } from "@tudu/db";
import {
  listPushDeviceTokensForUser,
  softDeletePushDeviceTokenByValue,
} from "@tudu/db";

type MessagingClient = {
  sendEachForMulticast: (message: {
    tokens: string[];
    data: Record<string, string>;
  }) => Promise<{
    responses: Array<{ success?: boolean; error?: { code?: string } }>;
  }>;
};

let messaging: MessagingClient | null | undefined;

async function resolveMessaging(): Promise<MessagingClient | null> {
  if (messaging !== undefined) {
    return messaging;
  }
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    messaging = null;
    return messaging;
  }
  try {
    const credentials = JSON.parse(raw) as Record<string, unknown>;
    const { cert, getApps, initializeApp } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");
    let app;
    if (getApps().length === 0) {
      app = initializeApp({ credential: cert(credentials) });
    } else {
      app = getApps()[0]!;
    }
    messaging = getMessaging(app);
  } catch (error) {
    console.error("[fcm] Failed to initialize Firebase Admin", error);
    messaging = null;
  }
  return messaging;
}

function isInvalidTokenError(code: string | undefined): boolean {
  return (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token"
  );
}

export async function sendWebPushPulse(
  db: Db,
  args: {
    userId: string;
    title: string;
    body: string;
  },
): Promise<void> {
  const client = await resolveMessaging();
  if (!client) {
    return;
  }
  const tokens = await listPushDeviceTokensForUser(db, args.userId);
  if (tokens.length === 0) {
    return;
  }
  const data: Record<string, string> = {
    title: args.title,
    body: args.body,
    kind: "regular",
    tag: "regular",
    path: "/today",
  };
  const response = await client.sendEachForMulticast({
    tokens,
    data,
  });
  for (let i = 0; i < response.responses.length; i += 1) {
    const result = response.responses[i];
    if (!result?.success && isInvalidTokenError(result?.error?.code)) {
      const token = tokens[i];
      if (token) {
        await softDeletePushDeviceTokenByValue(db, token);
      }
    }
  }
}

export async function sendWebPushForNotifications(
  db: Db,
  notifications: AppNotification[],
): Promise<void> {
  const client = await resolveMessaging();
  if (!client || notifications.length === 0) {
    return;
  }

  for (const notification of notifications) {
    const tokens = await listPushDeviceTokensForUser(db, notification.userId);
    if (tokens.length === 0) {
      continue;
    }
    const presentation = notification.metadata?.presentation as
      | { title?: string }
      | undefined;
    const data: Record<string, string> = {
      title: presentation?.title ?? notification.taskTitle ?? "Tudu",
      body: notification.body,
      notificationId: notification.id,
      kind: notification.kind,
      tag: notification.kind,
    };
    if (notification.taskId) {
      data.taskId = notification.taskId;
    }
    if (notification.ownerId) {
      data.ownerId = notification.ownerId;
    }
    if (notification.scheduledDate) {
      data.scheduledDate = notification.scheduledDate;
    }
    if (notification.commentId) {
      data.commentId = notification.commentId;
    }

    const response = await client.sendEachForMulticast({
      tokens,
      data,
    });

    for (let i = 0; i < response.responses.length; i += 1) {
      const result = response.responses[i];
      if (!result?.success && isInvalidTokenError(result?.error?.code)) {
        const token = tokens[i];
        if (token) {
          await softDeletePushDeviceTokenByValue(db, token);
        }
      }
    }
  }
}
