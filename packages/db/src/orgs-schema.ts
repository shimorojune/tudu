import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

export const spaceColor = pgEnum("space_color", [
  "vermilion",
  "amber",
  "ochre",
  "moss",
  "jade",
  "teal",
  "cobalt",
  "iris",
  "plum",
  "rose",
  "graphite",
  "ink",
]);

export const orgRole = pgEnum("org_role", ["owner", "member"]);

export const orgInviteStatus = pgEnum("org_invite_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const orgJoinRequestStatus = pgEnum("org_join_request_status", [
  "pending",
  "approved",
  "declined",
]);

export const orgAuditKind = pgEnum("org_audit_kind", [
  "org_created",
  "renamed",
  "color_changed",
  "logo_changed",
  "logo_removed",
  "join_link_enabled",
  "join_link_disabled",
  "join_link_regenerated",
  "domains_changed",
  "invite_sent",
  "invite_resent",
  "invite_revoked",
  "invite_accepted",
  "join_requested",
  "join_approved",
  "join_declined",
  "role_changed",
  "member_removed",
  "member_left",
  "ownership_transferred",
  "task_moved_in",
  "task_reassigned",
  "tasks_handed_over",
]);

export const taskRequestKind = pgEnum("task_request_kind", [
  "new_task",
  "reassign",
  "edit",
]);

export const taskRequestStatus = pgEnum("task_request_status", [
  "pending",
  "accepted",
  "declined",
  "withdrawn",
  "outdated",
  "returned_resolved",
]);

export const orgs = pgTable(
  "orgs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    color: spaceColor("color").notNull().default("vermilion"),
    logoStorageKey: text("logo_storage_key"),
    joinLinkEnabled: boolean("join_link_enabled").notNull().default(false),
    joinCode: text("join_code").notNull().unique(),
    allowedDomains: text("allowed_domains").array().notNull().default([]),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("orgs_created_by_idx").on(table.createdBy),
    uniqueIndex("orgs_key_prefix_uidx").on(table.keyPrefix),
  ],
);

export const orgMembers = pgTable(
  "org_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("org_members_live_uidx")
      .on(table.orgId, table.userId)
      .where(sql`${table.leftAt} is null`),
    index("org_members_user_idx").on(table.userId),
  ],
);

export const orgInvites = pgTable(
  "org_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: orgRole("role").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    status: orgInviteStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("org_invites_pending_uidx")
      .on(table.orgId, table.email)
      .where(sql`${table.status} = 'pending'`),
    index("org_invites_org_idx").on(table.orgId),
  ],
);

export const orgJoinRequests = pgTable(
  "org_join_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: orgJoinRequestStatus("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("org_join_requests_pending_uidx")
      .on(table.orgId, table.userId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const orgAuditLog = pgTable(
  "org_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    kind: orgAuditKind("kind").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("org_audit_log_org_created_idx").on(table.orgId, table.createdAt),
  ],
);

export const userActivity = pgTable("user_activity", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});

export const orgsRelations = relations(orgs, ({ many, one }) => ({
  members: many(orgMembers),
  creator: one(user, {
    fields: [orgs.createdBy],
    references: [user.id],
  }),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  org: one(orgs, { fields: [orgMembers.orgId], references: [orgs.id] }),
  user: one(user, { fields: [orgMembers.userId], references: [user.id] }),
}));

export const orgInvitesRelations = relations(orgInvites, ({ one }) => ({
  org: one(orgs, { fields: [orgInvites.orgId], references: [orgs.id] }),
  inviter: one(user, {
    fields: [orgInvites.invitedBy],
    references: [user.id],
  }),
}));

export const orgJoinRequestsRelations = relations(orgJoinRequests, ({ one }) => ({
  org: one(orgs, {
    fields: [orgJoinRequests.orgId],
    references: [orgs.id],
  }),
  user: one(user, {
    fields: [orgJoinRequests.userId],
    references: [user.id],
  }),
}));

export const orgAuditLogRelations = relations(orgAuditLog, ({ one }) => ({
  org: one(orgs, { fields: [orgAuditLog.orgId], references: [orgs.id] }),
  actor: one(user, {
    fields: [orgAuditLog.actorId],
    references: [user.id],
  }),
}));

export type OrgRow = typeof orgs.$inferSelect;
export type OrgMemberRow = typeof orgMembers.$inferSelect;