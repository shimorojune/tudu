import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";
import {
  orgs,
  taskRequestKind,
  taskRequestStatus,
} from "./orgs-schema.js";
import { tasks } from "./tasks-schema.js";

export const taskRequests = pgTable(
  "task_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    kind: taskRequestKind("kind").notNull(),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    status: taskRequestStatus("status").notNull().default("pending"),
    proposal: jsonb("proposal").notNull(),
    baseline: jsonb("baseline").notNull(),
    message: text("message"),
    declineReason: text("decline_reason"),
    acceptedFields: text("accepted_fields").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    index("task_requests_to_status_idx").on(table.toUserId, table.status),
    index("task_requests_from_status_idx").on(table.fromUserId, table.status),
    index("task_requests_task_status_idx").on(table.taskId, table.status),
  ],
);

export type TaskRequestRow = typeof taskRequests.$inferSelect;
