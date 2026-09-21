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
  inbox: boolean("inbox").notNull().default(true),
  comments: boolean("comments").notNull().default(true),
  taskChanges: boolean("task_changes").notNull().default(true),
  jira: boolean("jira").notNull().default(true),
  jiraAssigned: boolean("jira_assigned").notNull().default(true),
  jiraUnassigned: boolean("jira_unassigned").notNull().default(true),
  jiraComment: boolean("jira_comment").notNull().default(true),
  jiraUpdated: boolean("jira_updated").notNull().default(true),
  reminders: boolean("reminders").notNull().default(true),
  remindersFocus: boolean("reminders_focus").notNull().default(true),
  remindersDigest: boolean("reminders_digest").notNull().default(true),
  remindersDeadline: boolean("reminders_deadline").notNull().default(true),
  remindersSlipping: boolean("reminders_slipping").notNull().default(false),
  focusCheckInMinutes: integer("focus_check_in_minutes")
    .notNull()
    .default(90),
  workHoursEnabled: boolean("work_hours_enabled").notNull().default(true),
  workHoursStart: text("work_hours_start").notNull().default("09:00"),
  workHoursEnd: text("work_hours_end").notNull().default("18:00"),
  workDays: jsonb("work_days").$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
  appUpdate: boolean("app_update").notNull().default(true),
  timezone: text("timezone").notNull().default("UTC"),
  quietHoursStart: text("quiet_hours_start").notNull().default("22:00"),
  quietHoursEnd: text("quiet_hours_end").notNull().default("07:00"),
  jiraPollActiveMinutes: integer("jira_poll_active_minutes")
    .notNull()
    .default(3),
  jiraPollIdleMinutes: integer("jira_poll_idle_minutes")
    .notNull()
    .default(20),
  digestTimeLocal: text("digest_time_local").notNull().default("09:00"),
  lateReminderMinutes: integer("late_reminder_minutes")
    .notNull()
    .default(120),
  deadlineNudgeHours: jsonb("deadline_nudge_hours")
    .$type<number[]>()
    .notNull()
    .default([24, 4]),
  approachingRequiresInProgress: boolean("approaching_requires_in_progress")
    .notNull()
    .default(true),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  lastJiraPollAt: timestamp("last_jira_poll_at", { withTimezone: true }),
  nextJiraPollAt: timestamp("next_jira_poll_at", { withTimezone: true }),
  nextReminderCheckAt: timestamp("next_reminder_check_at", { withTimezone: true }),
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
