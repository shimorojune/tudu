import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";
import { tasks } from "./tasks-schema.js";

export const inviteStatus = pgEnum("manager_invite_status", [
  "pending",
  "accepted",
  "declined",
  "cancelled",
]);

export const inboxItemStatus = pgEnum("inbox_item_status", [
  "pending",
  "accepted",
  "declined",
]);

export const managerInvites = pgTable(
  "manager_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviterUserId: text("inviter_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reportEmail: text("report_email").notNull(),
    reportUserId: text("report_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    status: inviteStatus("status").notNull().default("pending"),
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
    uniqueIndex("manager_invites_pending_uidx")
      .on(table.inviterUserId, table.reportEmail)
      .where(sql`${table.status} = 'pending' and ${table.deletedAt} is null`),
    index("manager_invites_email_idx").on(table.reportEmail),
  ],
);

export const managerLinks = pgTable(
  "manager_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    managerUserId: text("manager_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reportUserId: text("report_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    uniqueIndex("manager_links_one_manager_uidx")
      .on(table.reportUserId)
      .where(sql`${table.deletedAt} is null`),
    index("manager_links_manager_idx").on(table.managerUserId),
  ],
);

export const managerPermissions = pgTable("manager_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  managerLinkId: uuid("manager_link_id")
    .notNull()
    .references(() => managerLinks.id, { onDelete: "cascade" })
    .unique(),
  canSeeDay: boolean("can_see_day").notNull().default(true),
  canSendInbox: boolean("can_send_inbox").notNull().default(true),
  canComment: boolean("can_comment").notNull().default(true),
  canReorder: boolean("can_reorder").notNull().default(true),
  canDelete: boolean("can_delete").notNull().default(true),
  canEdit: boolean("can_edit").notNull().default(false),
  canComplete: boolean("can_complete").notNull().default(false),
  canSeePrivate: boolean("can_see_private").notNull().default(false),
  canEditDeadlines: boolean("can_edit_deadlines").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: inboxItemStatus("status").notNull().default("pending"),
    declineReason: text("decline_reason"),
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
    index("inbox_items_to_status_idx").on(table.toUserId, table.status),
    index("inbox_items_task_idx").on(table.taskId),
  ],
);

export const managerInvitesRelations = relations(managerInvites, ({ one }) => ({
  inviter: one(user, {
    fields: [managerInvites.inviterUserId],
    references: [user.id],
    relationName: "inviteInviter",
  }),
  report: one(user, {
    fields: [managerInvites.reportUserId],
    references: [user.id],
    relationName: "inviteReport",
  }),
}));

export const managerLinksRelations = relations(managerLinks, ({ one }) => ({
  manager: one(user, {
    fields: [managerLinks.managerUserId],
    references: [user.id],
    relationName: "linkManager",
  }),
  report: one(user, {
    fields: [managerLinks.reportUserId],
    references: [user.id],
    relationName: "linkReport",
  }),
  permissions: one(managerPermissions, {
    fields: [managerLinks.id],
    references: [managerPermissions.managerLinkId],
  }),
}));

export const managerPermissionsRelations = relations(
  managerPermissions,
  ({ one }) => ({
    link: one(managerLinks, {
      fields: [managerPermissions.managerLinkId],
      references: [managerLinks.id],
    }),
  }),
);

export const inboxItemsRelations = relations(inboxItems, ({ one }) => ({
  task: one(tasks, {
    fields: [inboxItems.taskId],
    references: [tasks.id],
  }),
  from: one(user, {
    fields: [inboxItems.fromUserId],
    references: [user.id],
    relationName: "inboxFrom",
  }),
  to: one(user, {
    fields: [inboxItems.toUserId],
    references: [user.id],
    relationName: "inboxTo",
  }),
}));

export type ManagerInviteRow = typeof managerInvites.$inferSelect;
export type NewManagerInviteRow = typeof managerInvites.$inferInsert;
export type ManagerLinkRow = typeof managerLinks.$inferSelect;
export type ManagerPermissionRow = typeof managerPermissions.$inferSelect;
export type InboxItemRow = typeof inboxItems.$inferSelect;
