import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";
import { orgs, spaceColor } from "./orgs-schema.js";

export { spaceColor as projectColor };
export type ProjectColorDb = (typeof spaceColor.enumValues)[number];

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    color: spaceColor("color").notNull(),
    isPrivate: boolean("is_private").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
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
    uniqueIndex("projects_owner_name_uidx")
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null and ${table.orgId} is null`),
    uniqueIndex("projects_org_name_uidx")
      .on(table.orgId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null and ${table.orgId} is not null`),
    index("projects_user_idx").on(table.userId),
    index("projects_org_idx").on(table.orgId),
    check(
      "projects_org_not_private",
      sql`${table.orgId} is null or ${table.isPrivate} = false`,
    ),
  ],
);

export const projectsRelations = relations(projects, ({ one }) => ({
  owner: one(user, {
    fields: [projects.userId],
    references: [user.id],
  }),
}));

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
