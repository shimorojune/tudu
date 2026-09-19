import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

export const reminderDeliveryState = pgTable(
  "reminder_delivery_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    deliveryKey: text("delivery_key").notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("reminder_delivery_user_key_uidx").on(
      table.userId,
      table.deliveryKey,
    ),
    index("reminder_delivery_user_idx").on(table.userId),
  ],
);

export const reminderDeliveryStateRelations = relations(
  reminderDeliveryState,
  ({ one }) => ({
    user: one(user, {
      fields: [reminderDeliveryState.userId],
      references: [user.id],
    }),
  }),
);

export type ReminderDeliveryStateRow = typeof reminderDeliveryState.$inferSelect;
