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
import { tasks } from "./tasks-schema.js";

export const timelineEventType = pgEnum("timeline_event_type", [
  "created",
  "renamed",
  "description_changed",
  "completed",
  "reopened",
  "moved",
  "rescheduled",
  "deadline_changed",
  "start_changed",
  "privacy_changed",
  "commented",
  "comment_edited",
  "comment_deleted",
  "rolled_over",
  "inbox_sent",
  "inbox_accepted",
  "inbox_declined",
  "project_changed",
]);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
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
    index("comments_task_idx").on(table.taskId, table.createdAt),
    index("comments_author_idx").on(table.authorId),
  ],
);

export const timelineEvents = pgTable(
  "timeline_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** Null means a system event (rollover rows land here in step 6). */
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: timelineEventType("type").notNull(),
    /** Structured diff. Rendered to English in the UI, never stored as prose. */
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("timeline_events_task_idx").on(table.taskId, table.createdAt),
  ],
);

export type CommentRow = typeof comments.$inferSelect;
export type NewCommentRow = typeof comments.$inferInsert;
export type TimelineEventRow = typeof timelineEvents.$inferSelect;
export type NewTimelineEventRow = typeof timelineEvents.$inferInsert;

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(user, { fields: [comments.authorId], references: [user.id] }),
}));

export const timelineEventsRelations = relations(timelineEvents, ({ one }) => ({
  task: one(tasks, { fields: [timelineEvents.taskId], references: [tasks.id] }),
  actor: one(user, { fields: [timelineEvents.actorId], references: [user.id] }),
}));
