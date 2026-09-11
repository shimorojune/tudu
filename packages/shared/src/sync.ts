import { z } from "zod";
import {
  acceptInboxRequestSchema,
  createInviteRequestSchema,
  declineInboxRequestSchema,
  sendInboxTaskRequestSchema,
} from "./manager.js";
import {
  createSubtaskRequestSchema,
  createTaskRequestSchema,
  reorderRequestSchema,
  reorderSubtasksRequestSchema,
  rolloverRequestSchema,
  updateSubtaskRequestSchema,
  updateTaskRequestSchema,
} from "./tasks.js";

export function recipientsForTask(args: {
  ownerId: string;
  isPrivate: boolean;
  managerUserId: string | null;
}): string[] {
  if (args.isPrivate || !args.managerUserId || args.managerUserId === args.ownerId) {
    return [args.ownerId];
  }

  return [args.ownerId, args.managerUserId];
}

export type SyncView =
  | { type: "day"; date: string }
  | { type: "unscheduled" }
  | { type: "inbox" }
  | { type: "team"; date: string }
  | { type: "reportDay"; userId: string; date: string }
  | { type: "taskDetail"; taskId: string };

export const viewKey = {
  day: (date: string) => `day:${date}`,
  unscheduled: () => "unscheduled",
  inbox: () => "inbox",
  team: (date: string) => `team:${date}`,
  reportDay: (userId: string, date: string) => `reportDay:${userId}:${date}`,
  taskDetail: (taskId: string) => `taskDetail:${taskId}`,
};

export function parseViewKey(key: string): SyncView | null {
  if (key === "unscheduled") {
    return { type: "unscheduled" };
  }
  if (key === "inbox") {
    return { type: "inbox" };
  }
  if (key.startsWith("day:")) {
    return { type: "day", date: key.slice(4) };
  }
  if (key.startsWith("team:")) {
    return { type: "team", date: key.slice(5) };
  }
  if (key.startsWith("taskDetail:")) {
    return { type: "taskDetail", taskId: key.slice(11) };
  }
  if (key.startsWith("reportDay:")) {
    const rest = key.slice(10);
    const split = rest.lastIndexOf(":");
    if (split <= 0) {
      return null;
    }
    return {
      type: "reportDay",
      userId: rest.slice(0, split),
      date: rest.slice(split + 1),
    };
  }
  return null;
}

export const SYNC_EVENT_TYPES = [
  "task.upsert",
  "task.delete",
  "task.hide",
  "comment.upsert",
  "comment.delete",
  "timeline.append",
  "inbox.upsert",
  "inbox.delete",
  "invite.upsert",
  "roster.upsert",
  "reportDay.upsert",
] as const;

export type SyncEventType = (typeof SYNC_EVENT_TYPES)[number];

export const syncOpSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("task.create"),
    id: z.uuid(),
    body: createTaskRequestSchema,
  }),
  z.object({
    type: z.literal("task.update"),
    id: z.uuid(),
    patch: updateTaskRequestSchema,
  }),
  z.object({
    type: z.literal("task.delete"),
    id: z.uuid(),
  }),
  z.object({
    type: z.literal("task.reorder"),
    body: reorderRequestSchema,
  }),
  z.object({
    type: z.literal("task.rollover"),
    body: rolloverRequestSchema,
  }),
  z.object({
    type: z.literal("subtask.create"),
    id: z.uuid(),
    taskId: z.uuid(),
    body: createSubtaskRequestSchema,
  }),
  z.object({
    type: z.literal("subtask.update"),
    id: z.uuid(),
    patch: updateSubtaskRequestSchema,
  }),
  z.object({
    type: z.literal("subtask.delete"),
    id: z.uuid(),
  }),
  z.object({
    type: z.literal("subtask.reorder"),
    taskId: z.uuid(),
    body: reorderSubtasksRequestSchema,
  }),
  z.object({
    type: z.literal("comment.create"),
    id: z.uuid(),
    taskId: z.uuid(),
    body: z.object({ body: z.string().trim().min(1).max(5000) }),
  }),
  z.object({
    type: z.literal("comment.update"),
    id: z.uuid(),
    taskId: z.uuid(),
    patch: z.object({ body: z.string().trim().min(1).max(5000) }),
  }),
  z.object({
    type: z.literal("comment.delete"),
    id: z.uuid(),
    taskId: z.uuid(),
  }),
  z.object({
    type: z.literal("inbox.accept"),
    id: z.uuid(),
    body: acceptInboxRequestSchema,
  }),
  z.object({
    type: z.literal("inbox.decline"),
    id: z.uuid(),
    body: declineInboxRequestSchema,
  }),
  z.object({
    type: z.literal("team.invite.create"),
    body: createInviteRequestSchema,
  }),
  z.object({
    type: z.literal("team.invite.accept"),
    id: z.uuid(),
  }),
  z.object({
    type: z.literal("team.invite.decline"),
    id: z.uuid(),
  }),
  z.object({
    type: z.literal("team.task.send"),
    id: z.uuid(),
    userId: z.string(),
    body: sendInboxTaskRequestSchema,
  }),
  z.object({
    type: z.literal("team.task.reorder"),
    userId: z.string(),
    body: reorderRequestSchema,
  }),
  z.object({
    type: z.literal("team.task.delete"),
    userId: z.string(),
    taskId: z.uuid(),
  }),
]);

export type SyncOp = z.infer<typeof syncOpSchema>;

export const syncPushRequestSchema = z.object({
  clientMutationId: z.uuid(),
  op: syncOpSchema,
});

export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const syncEventSchema = z.object({
  seq: z.number().int(),
  recipientUserId: z.string(),
  clientMutationId: z.string().nullable(),
  type: z.enum(SYNC_EVENT_TYPES),
  payload: z.unknown(),
});

export type SyncEvent = z.infer<typeof syncEventSchema>;

export const syncBootstrapViewSchema = z.object({
  key: z.string(),
});

export const syncBootstrapRequestSchema = z.object({
  views: z.array(z.string()).default([]),
});

export type SyncBootstrapRequest = z.infer<typeof syncBootstrapRequestSchema>;

export type SyncPushResponse = {
  clientMutationId: string;
  seq: number;
  events: SyncEvent[];
};

export type SyncBootstrapResponse = {
  currentSeq: number;
  events: SyncEvent[];
};
