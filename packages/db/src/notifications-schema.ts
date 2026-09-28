import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";
import { comments } from "./activity-schema.js";
import { orgs } from "./orgs-schema.js";
import { taskRequests } from "./task-requests-schema.js";
import { tasks } from "./tasks-schema.js";

export const notificationKind = pgEnum("notification_kind", [
  "inbox",
  "comment",
  "task_changed",
  "task_deleted",
  "inbox_declined",
  "jira_assigned",
  "jira_unassigned",
  "jira_comment",
  "jira_updated",
  "reminder_digest",
  "reminder_focus",
  "reminder_late",
  "reminder_deadline",
  "app_update",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    commentId: uuid("comment_id").references(() => comments.id, {
      onDelete: "set null",
    }),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
    requestId: uuid("request_id").references(() => taskRequests.id, {
      onDelete: "set null",
    }),
    scheduledDate: text("scheduled_date"),
    jiraIssueId: text("jira_issue_id"),
    jiraIssueKey: text("jira_issue_key"),
    appVersion: text("app_version"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    taskTitle: text("task_title").notNull(),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
    index("notifications_user_read_idx").on(table.userId, table.readAt),
  ],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(user, {
    fields: [notifications.userId],
    references: [user.id],
    relationName: "notificationRecipient",
  }),
  actor: one(user, {
    fields: [notifications.actorId],
    references: [user.id],
    relationName: "notificationActor",
  }),
}));

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
