import { relations } from "drizzle-orm";
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

export const syncEvents = pgTable(
  "sync_events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientMutationId: text("client_mutation_id"),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("sync_events_recipient_id_idx").on(table.recipientUserId, table.id),
    index("sync_events_mutation_idx").on(
      table.recipientUserId,
      table.clientMutationId,
    ),
  ],
);

export const syncMutations = pgTable(
  "sync_mutations",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientMutationId: text("client_mutation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("sync_mutations_user_mutation_uidx").on(
      table.userId,
      table.clientMutationId,
    ),
  ],
);

export const syncEventsRelations = relations(syncEvents, ({ one }) => ({
  recipient: one(user, {
    fields: [syncEvents.recipientUserId],
    references: [user.id],
  }),
}));

export type SyncEventRow = typeof syncEvents.$inferSelect;
export type NewSyncEventRow = typeof syncEvents.$inferInsert;
export type SyncMutationRow = typeof syncMutations.$inferSelect;
