import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

export const notificationPreferences = pgTable("notification_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  osEnabled: boolean("os_enabled").notNull().default(false),
  regularEnabled: boolean("regular_enabled").notNull().default(true),
  regularIntervalMinutes: integer("regular_interval_minutes")
    .notNull()
    .default(60),
  workHoursStart: text("work_hours_start").notNull().default("09:00"),
  workHoursEnd: text("work_hours_end").notNull().default("18:00"),
  workDays: jsonb("work_days").$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
  eventsEnabled: boolean("events_enabled").notNull().default(true),
  eventsJira: boolean("events_jira").notNull().default(true),
  eventsInbox: boolean("events_inbox").notNull().default(true),
  eventsComments: boolean("events_comments").notNull().default(true),
  timezone: text("timezone").notNull().default("UTC"),
  jiraPollActiveMinutes: integer("jira_poll_active_minutes")
    .notNull()
    .default(3),
  jiraPollIdleMinutes: integer("jira_poll_idle_minutes")
    .notNull()
    .default(20),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  lastJiraPollAt: timestamp("last_jira_poll_at", { withTimezone: true }),
  nextJiraPollAt: timestamp("next_jira_poll_at", { withTimezone: true }),
  nextRegularAt: timestamp("next_regular_at", { withTimezone: true }),
  nextVersionCheckAt: timestamp("next_version_check_at", { withTimezone: true }),
  clientAppVersion: text("client_app_version"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const notificationPreferencesRelations = relations(
  notificationPreferences,
  ({ one }) => ({
    user: one(user, {
      fields: [notificationPreferences.userId],
      references: [user.id],
    }),
  }),
);

export type NotificationPreferencesRow =
  typeof notificationPreferences.$inferSelect;
