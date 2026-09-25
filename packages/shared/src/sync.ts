import { z } from "zod";
import {
  createJiraCommentRequestSchema,
  createJiraIssueRequestSchema,
  linkJiraTaskRequestSchema,
  spawnJiraTaskRequestSchema,
  spawnReportJiraTaskRequestSchema,
  unlinkJiraTaskRequestSchema,
  updateJiraIssueFieldsRequestSchema,
} from "./jira.js";
import {
  acceptInboxRequestSchema,
  createInviteRequestSchema,
  declineInboxRequestSchema,
  sendInboxTaskRequestSchema,
} from "./manager.js";
import {
  createProjectRequestSchema,
  updateProjectRequestSchema,
} from "./projects.js";
import {
  createSubtaskRequestSchema,
  createTaskRequestSchema,
  reorderRequestSchema,
  reorderSubtasksRequestSchema,
  rolloverRequestSchema,
  updateSubtaskRequestSchema,
  updateTaskRequestSchema,
} from "./tasks.js";
import type { NotificationPresentation } from "./notificationPresentation.js";

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
  | { type: "taskDetail"; taskId: string }
  | { type: "notifications" }
  | { type: "projects" }
  | { type: "project"; projectId: string }
  | { type: "reportProjects"; userId: string }
  | { type: "reportUnscheduled"; userId: string }
  | { type: "reportInbox"; userId: string }
  | { type: "jira" }
  | { type: "jiraIssue"; issueIdOrKey: string }
  | { type: "jiraComponents" }
  | { type: "jiraUsers" }
  | { type: "reportJira"; userId: string };

export const viewKey = {
  day: (date: string) => `day:${date}`,
  unscheduled: () => "unscheduled",
  inbox: () => "inbox",
  team: (date: string) => `team:${date}`,
  reportDay: (userId: string, date: string) => `reportDay:${userId}:${date}`,
  taskDetail: (taskId: string) => `taskDetail:${taskId}`,
  notifications: () => "notifications",
  projects: () => "projects",
  project: (projectId: string) => `project:${projectId}`,
  reportProjects: (userId: string) => `reportProjects:${userId}`,
  reportUnscheduled: (userId: string) => `reportUnscheduled:${userId}`,
  reportInbox: (userId: string) => `reportInbox:${userId}`,
  jira: () => "jira",
  jiraIssue: (issueIdOrKey: string) => `jiraIssue:${issueIdOrKey}`,
  jiraComponents: () => "jiraComponents",
  jiraUsers: () => "jiraUsers",
  reportJira: (userId: string) => `reportJira:${userId}`,
};

export function parseViewKey(key: string): SyncView | null {
  if (key === "unscheduled") {
    return { type: "unscheduled" };
  }
  if (key === "inbox") {
    return { type: "inbox" };
  }
  if (key === "notifications") {
    return { type: "notifications" };
  }
  if (key === "projects") {
    return { type: "projects" };
  }
  if (key === "jira") {
    return { type: "jira" };
  }
  if (key === "jiraComponents") {
    return { type: "jiraComponents" };
  }
  if (key === "jiraUsers") {
    return { type: "jiraUsers" };
  }
  if (key.startsWith("jiraIssue:")) {
    const issueIdOrKey = key.slice("jiraIssue:".length);
    if (!issueIdOrKey) {
      return null;
    }
    return { type: "jiraIssue", issueIdOrKey };
  }
  if (key.startsWith("reportJira:")) {
    const userId = key.slice("reportJira:".length);
    if (!userId) {
      return null;
    }
    return { type: "reportJira", userId };
  }
  if (key.startsWith("project:")) {
    return { type: "project", projectId: key.slice(8) };
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
  if (key.startsWith("reportProjects:")) {
    const userId = key.slice("reportProjects:".length);
    if (!userId) {
      return null;
    }
    return { type: "reportProjects", userId };
  }
  if (key.startsWith("reportUnscheduled:")) {
    const userId = key.slice("reportUnscheduled:".length);
    if (!userId) {
      return null;
    }
    return { type: "reportUnscheduled", userId };
  }
  if (key.startsWith("reportInbox:")) {
    const userId = key.slice("reportInbox:".length);
    if (!userId) {
      return null;
    }
    return { type: "reportInbox", userId };
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
  "notification.upsert",
  "notification.pulse",
  "notification.readAll",
  "project.upsert",
  "project.delete",
  "reportInbox.upsert",
  "jira.connection",
  "jira.issue.upsert",
  "jira.issue.delete",
  "jira.comment.upsert",
  "jira.link.upsert",
  "jira.link.delete",
  "jira.user.upsert",
  "jira.component.upsert",
  "jira.reportIssue.upsert",
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
  z.object({
    type: z.literal("notification.read"),
    id: z.uuid(),
  }),
  z.object({
    type: z.literal("notification.readAll"),
  }),
  z.object({
    type: z.literal("project.create"),
    id: z.uuid(),
    body: createProjectRequestSchema,
  }),
  z.object({
    type: z.literal("project.update"),
    id: z.uuid(),
    patch: updateProjectRequestSchema,
  }),
  z.object({
    type: z.literal("project.delete"),
    id: z.uuid(),
  }),
  z.object({
    type: z.literal("team.project.create"),
    id: z.uuid(),
    userId: z.string(),
    body: createProjectRequestSchema,
  }),
  z.object({
    type: z.literal("jira.link"),
    id: z.uuid(),
  }).extend(linkJiraTaskRequestSchema.shape),
  z.object({ type: z.literal("jira.unlink") }).extend(
    unlinkJiraTaskRequestSchema.shape,
  ),
  z.object({
    type: z.literal("jira.task.spawn"),
    id: z.uuid(),
    body: spawnJiraTaskRequestSchema,
  }),
  z.object({
    type: z.literal("jira.reportTask.spawn"),
    id: z.uuid(),
    body: spawnReportJiraTaskRequestSchema,
  }),
  z.object({
    type: z.literal("jira.issue.create"),
    id: z.uuid(),
    body: createJiraIssueRequestSchema,
  }),
  z.object({
    type: z.literal("jira.issue.updateFields"),
    body: updateJiraIssueFieldsRequestSchema,
  }),
  z.object({
    type: z.literal("jira.issue.updateDueDate"),
    issueIdOrKey: z.string().trim().min(1),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
      .nullable(),
  }),
  z.object({
    type: z.literal("jira.issue.updateAssignee"),
    issueIdOrKey: z.string().trim().min(1),
    assignee: z.unknown().nullable(),
  }),
  z.object({
    type: z.literal("jira.comment.create"),
    id: z.uuid(),
  }).extend(createJiraCommentRequestSchema.shape),
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

export type NotificationPulse = {
  id: string;
  kind: "regular";
  presentation: NotificationPresentation;
  sentAt: string;
};

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
