import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

/** Declaration order matters: Postgres sorts an enum by the order its values were
    declared, so `order by bucket` yields Now, then Next, then Later for free. */
export const taskBucket = pgEnum("task_bucket", ["now", "next", "later"]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Null means unscheduled: the task lives in the backlog, not in any day. */
    scheduledDate: date("scheduled_date", { mode: "string" }),
    /** Null only when scheduledDate is null. No default on purpose: a default would
        silently bucket a backlog task. */
    bucket: taskBucket("bucket"),
    /** Order inside this task's lane. Meaningless across lanes. */
    position: integer("position").notNull(),
    startDate: date("start_date", { mode: "string" }),
    deadline: timestamp("deadline", { withTimezone: true }),
    /** A timestamp rather than a boolean, because step 5's timeline needs to know
        when the task was finished. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    carriedDays: integer("carried_days").notNull().default(0),
    carriedSince: date("carried_since", { mode: "string" }),
    isPrivate: boolean("is_private").notNull().default(false),
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
    index("tasks_lane_idx").on(
      table.userId,
      table.scheduledDate,
      table.bucket,
      table.position,
    ),
    /** The whole point of step 2's model decision. A task has a day and a bucket, or
        neither. Postgres indexes and compares nulls fine, so the Unscheduled lane is
        just the lane where both are null. */
    check(
      "tasks_day_and_bucket_paired",
      sql`(${table.scheduledDate} is null) = (${table.bucket} is null)`,
    ),
  ],
);

export const subtasks = pgTable(
  "subtasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("subtasks_task_idx").on(table.taskId, table.position)],
);

export const tasksRelations = relations(tasks, ({ many, one }) => ({
  subtasks: many(subtasks),
  owner: one(user, {
    fields: [tasks.userId],
    references: [user.id],
  }),
}));

export const subtasksRelations = relations(subtasks, ({ one }) => ({
  task: one(tasks, {
    fields: [subtasks.taskId],
    references: [tasks.id],
  }),
}));

/** Named `TaskRow`, not `Task`, because `@tudu/shared` already exports `Task` as the
    wire shape and `apps/server` imports both in the same file. Row is what is in
    Postgres, Task is what goes over HTTP. */
export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type SubtaskRow = typeof subtasks.$inferSelect;
export type NewSubtaskRow = typeof subtasks.$inferInsert;
