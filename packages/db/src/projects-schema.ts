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

export const projectColor = pgEnum("project_color", [
  "ember",
  "rust",
  "clay",
  "ink",
  "stone",
  "moss",
]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: projectColor("color").notNull(),
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
      .where(sql`${table.deletedAt} is null`),
    index("projects_user_idx").on(table.userId),
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
