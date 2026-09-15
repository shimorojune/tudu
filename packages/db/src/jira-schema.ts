import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { JiraComponent, JiraUser } from "@tudu/shared";
import { user } from "./auth-schema.js";
import { tasks } from "./tasks-schema.js";

export const jiraConnections = pgTable("jira_connections", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  baseUrl: text("base_url").notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  tokenIv: text("token_iv").notNull(),
  tokenAuthTag: text("token_auth_tag").notNull(),
  displayName: text("display_name"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const jiraProjects = pgTable(
  "jira_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name"),
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
    uniqueIndex("jira_projects_user_key_uidx")
      .on(table.userId, table.key)
      .where(sql`${table.deletedAt} is null`),
    index("jira_projects_user_idx").on(table.userId),
  ],
);

export const jiraComponents = pgTable(
  "jira_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectKey: text("project_key").notNull(),
    componentId: text("component_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    archived: boolean("archived").notNull().default(false),
    cachedAt: timestamp("cached_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("jira_components_user_project_component_uidx")
      .on(table.userId, table.projectKey, table.componentId)
      .where(sql`${table.deletedAt} is null`),
    index("jira_components_user_project_idx").on(table.userId, table.projectKey),
  ],
);

export const jiraUsers = pgTable(
  "jira_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id"),
    userKey: text("user_key"),
    name: text("name"),
    displayName: text("display_name").notNull(),
    emailAddress: text("email_address"),
    active: boolean("active").notNull().default(true),
    avatarUrl: text("avatar_url"),
    cachedAt: timestamp("cached_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("jira_users_user_account_uidx")
      .on(table.userId, table.accountId)
      .where(sql`${table.accountId} is not null and ${table.deletedAt} is null`),
    uniqueIndex("jira_users_user_key_uidx")
      .on(table.userId, table.userKey)
      .where(sql`${table.accountId} is null and ${table.userKey} is not null and ${table.deletedAt} is null`),
    uniqueIndex("jira_users_user_name_uidx")
      .on(table.userId, table.name)
      .where(sql`${table.accountId} is null and ${table.userKey} is null and ${table.name} is not null and ${table.deletedAt} is null`),
    index("jira_users_user_email_idx").on(table.userId, table.emailAddress),
  ],
);

export const jiraIssues = pgTable(
  "jira_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    issueId: text("issue_id").notNull(),
    key: text("key").notNull(),
    summary: text("summary").notNull(),
    description: text("description"),
    statusId: text("status_id").notNull(),
    statusName: text("status_name").notNull(),
    statusCategory: text("status_category").notNull(),
    statusColorName: text("status_color_name"),
    issueType: text("issue_type"),
    priority: text("priority"),
    assigneeAccountId: text("assignee_account_id"),
    assigneeName: text("assignee_name"),
    assigneeEmail: text("assignee_email"),
    dueDate: text("due_date"),
    components: jsonb("components").notNull().$type<JiraComponent[]>(),
    browseUrl: text("browse_url").notNull(),
    remoteUpdatedAt: timestamp("remote_updated_at", { withTimezone: true }).notNull(),
    cachedAt: timestamp("cached_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    assignedListAt: timestamp("assigned_list_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("jira_issues_user_issue_uidx")
      .on(table.userId, table.issueId)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("jira_issues_user_key_uidx")
      .on(table.userId, table.key)
      .where(sql`${table.deletedAt} is null`),
    index("jira_issues_user_assigned_list_idx")
      .on(table.userId, table.assignedListAt)
      .where(sql`${table.assignedListAt} is not null and ${table.deletedAt} is null`),
    index("jira_issues_user_updated_idx").on(table.userId, table.remoteUpdatedAt),
  ],
);

export const jiraTaskLinks = pgTable(
  "jira_task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    issueId: text("issue_id").notNull(),
    issueKey: text("issue_key").notNull(),
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
    uniqueIndex("jira_task_links_live_uidx")
      .on(table.userId, table.taskId, table.issueId)
      .where(sql`${table.deletedAt} is null`),
    index("jira_task_links_task_idx").on(table.taskId),
    index("jira_task_links_user_issue_idx").on(table.userId, table.issueId),
  ],
);

export const jiraIssueComments = pgTable(
  "jira_issue_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    issueId: text("issue_id").notNull(),
    issueKey: text("issue_key").notNull(),
    commentId: text("comment_id").notNull(),
    author: jsonb("author").notNull().$type<JiraUser>(),
    body: text("body").notNull(),
    remoteCreatedAt: timestamp("remote_created_at", { withTimezone: true }).notNull(),
    remoteUpdatedAt: timestamp("remote_updated_at", { withTimezone: true }).notNull(),
    cachedAt: timestamp("cached_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("jira_comments_user_issue_comment_uidx")
      .on(table.userId, table.issueId, table.commentId)
      .where(sql`${table.deletedAt} is null`),
    index("jira_comments_user_issue_idx").on(table.userId, table.issueId),
  ],
);

export const jiraJqlPresets = pgTable(
  "jira_jql_presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    jql: text("jql").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
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
    uniqueIndex("jira_jql_presets_user_name_uidx")
      .on(table.userId, table.name)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("jira_jql_presets_user_default_uidx")
      .on(table.userId)
      .where(sql`${table.isDefault} = true and ${table.deletedAt} is null`),
    index("jira_jql_presets_user_idx").on(table.userId),
  ],
);

export const jiraRefreshCursors = pgTable(
  "jira_refresh_cursors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    viewKey: text("view_key").notNull(),
    cursorUpdatedAt: timestamp("cursor_updated_at", { withTimezone: true }),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("jira_refresh_cursors_user_view_uidx").on(
      table.userId,
      table.viewKey,
    ),
  ],
);

export const jiraConnectionsRelations = relations(jiraConnections, ({ one }) => ({
  owner: one(user, {
    fields: [jiraConnections.userId],
    references: [user.id],
  }),
}));

export const jiraTaskLinksRelations = relations(jiraTaskLinks, ({ one }) => ({
  owner: one(user, {
    fields: [jiraTaskLinks.userId],
    references: [user.id],
  }),
  task: one(tasks, {
    fields: [jiraTaskLinks.taskId],
    references: [tasks.id],
  }),
}));

export type JiraConnectionRow = typeof jiraConnections.$inferSelect;
export type NewJiraConnectionRow = typeof jiraConnections.$inferInsert;
export type JiraProjectRow = typeof jiraProjects.$inferSelect;
export type NewJiraProjectRow = typeof jiraProjects.$inferInsert;
export type JiraComponentRow = typeof jiraComponents.$inferSelect;
export type NewJiraComponentRow = typeof jiraComponents.$inferInsert;
export type JiraUserRow = typeof jiraUsers.$inferSelect;
export type NewJiraUserRow = typeof jiraUsers.$inferInsert;
export type JiraIssueRow = typeof jiraIssues.$inferSelect;
export type NewJiraIssueRow = typeof jiraIssues.$inferInsert;
export type JiraTaskLinkRow = typeof jiraTaskLinks.$inferSelect;
export type NewJiraTaskLinkRow = typeof jiraTaskLinks.$inferInsert;
export type JiraIssueCommentRow = typeof jiraIssueComments.$inferSelect;
export type NewJiraIssueCommentRow = typeof jiraIssueComments.$inferInsert;
export type JiraJqlPresetRow = typeof jiraJqlPresets.$inferSelect;
export type NewJiraJqlPresetRow = typeof jiraJqlPresets.$inferInsert;
export type JiraRefreshCursorRow = typeof jiraRefreshCursors.$inferSelect;
