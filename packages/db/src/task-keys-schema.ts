import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";
import { orgs } from "./orgs-schema.js";

export const userSpaceSettings = pgTable("user_space_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  personalKeyPrefix: text("personal_key_prefix").notNull().default("ME"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const spaceKeyCounters = pgTable(
  "space_key_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
    nextNumber: integer("next_number").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("space_key_counters_personal_uidx")
      .on(table.userId)
      .where(sql`${table.orgId} is null`),
    uniqueIndex("space_key_counters_org_uidx")
      .on(table.orgId)
      .where(sql`${table.orgId} is not null`),
    index("space_key_counters_user_idx").on(table.userId),
  ],
);

export const spaceKeyPrefixHistory = pgTable(
  "space_key_prefix_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
    prefix: text("prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("space_key_prefix_history_user_idx").on(table.userId, table.createdAt),
    index("space_key_prefix_history_org_idx").on(table.orgId, table.createdAt),
    index("space_key_prefix_history_prefix_idx").on(table.prefix),
  ],
);

export const userSpaceSettingsRelations = relations(userSpaceSettings, ({ one }) => ({
  user: one(user, {
    fields: [userSpaceSettings.userId],
    references: [user.id],
  }),
}));

export type UserSpaceSettingsRow = typeof userSpaceSettings.$inferSelect;
export type SpaceKeyCounterRow = typeof spaceKeyCounters.$inferSelect;
export type SpaceKeyPrefixHistoryRow = typeof spaceKeyPrefixHistory.$inferSelect;
