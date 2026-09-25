import { and, eq } from "drizzle-orm";
import type { Db } from "./index.js";
import {
  reminderDeliveryState,
  type ReminderDeliveryStateRow,
} from "./reminder-delivery-schema.js";

export async function getReminderDelivery(
  db: Db,
  userId: string,
  deliveryKey: string,
): Promise<ReminderDeliveryStateRow | undefined> {
  return db.query.reminderDeliveryState.findFirst({
    where: and(
      eq(reminderDeliveryState.userId, userId),
      eq(reminderDeliveryState.deliveryKey, deliveryKey),
    ),
  });
}

export async function recordReminderDelivery(
  db: Db,
  userId: string,
  deliveryKey: string,
  sentAt: Date = new Date(),
): Promise<void> {
  await db
    .insert(reminderDeliveryState)
    .values({ userId, deliveryKey, lastSentAt: sentAt })
    .onConflictDoUpdate({
      target: [reminderDeliveryState.userId, reminderDeliveryState.deliveryKey],
      set: { lastSentAt: sentAt },
    });
}

export async function wasReminderSentAfter(
  db: Db,
  userId: string,
  deliveryKey: string,
  notBefore: Date,
): Promise<boolean> {
  const row = await getReminderDelivery(db, userId, deliveryKey);
  return row ? row.lastSentAt >= notBefore : false;
}

export async function deleteReminderDelivery(
  db: Db,
  userId: string,
  deliveryKey: string,
): Promise<void> {
  await db
    .delete(reminderDeliveryState)
    .where(
      and(
        eq(reminderDeliveryState.userId, userId),
        eq(reminderDeliveryState.deliveryKey, deliveryKey),
      ),
    );
}
