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

export const jiraIssueWatchState = pgTable(
  "jira_issue_watch_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    issueId: text("issue_id").notNull(),
    issueKey: text("issue_key").notNull(),
    assigneeAccountId: text("assignee_account_id"),
    statusName: text("status_name"),
    priorityName: text("priority_name"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    summary: text("summary"),
    descriptionHash: text("description_hash"),
    lastCommentId: text("last_comment_id"),
    lastCommentUpdatedAt: timestamp("last_comment_updated_at", {
      withTimezone: true,
    }),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("jira_issue_watch_user_issue_uidx").on(
      table.userId,
      table.issueId,
    ),
    index("jira_issue_watch_user_idx").on(table.userId),
  ],
);

export const jiraIssueWatchStateRelations = relations(
  jiraIssueWatchState,
  ({ one }) => ({
    user: one(user, {
      fields: [jiraIssueWatchState.userId],
      references: [user.id],
    }),
  }),
);

export type JiraIssueWatchStateRow = typeof jiraIssueWatchState.$inferSelect;
