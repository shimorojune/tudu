import { z } from "zod";
import {
  createJiraCommentRequestSchema,
  createJiraIssueRequestSchema,
  linkJiraTaskRequestSchema,
  spawnJiraTaskRequestSchema,
  unlinkJiraTaskRequestSchema,
  updateJiraIssueFieldsRequestSchema,
} from "./jira.js";
import {
  requestAcceptBodySchema,
  requestDeclineBodySchema,
  requestProposeBodySchema,
  requestReassignBodySchema,
  requestReturnedDiscardBodySchema,
  requestReturnedResendBodySchema,
  requestReturnedTakeBodySchema,
  requestSendBodySchema,
  requestWithdrawBodySchema,
} from "./orgs/requestOps.js";
import {
  createProjectRequestSchema,
  updateProjectRequestSchema,
} from "./projects.js";
import {
  createSubtaskRequestSchema,
  createTaskRequestSchema,
  reorderRequestSchema,
  moveTaskToSpaceRequestSchema,
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
  | { type: "requests"; space: string }
  | { type: "taskDetail"; taskId: string }
  | { type: "notifications" }
  | { type: "projects" }
  | { type: "project"; projectId: string }
  | { type: "jira" }
  | { type: "jiraIssue"; issueIdOrKey: string }
  | { type: "jiraComponents" }
  | { type: "jiraUsers" };

export const viewKey = {
  day: (date: string) => `day:${date}`,
  unscheduled: () => "unscheduled",
  requests: (space: string) => `requests:${space}`,
  taskDetail: (taskId: string) => `taskDetail:${taskId}`,
  notifications: () => "notifications",
  projects: () => "projects",
  project: (projectId: string) => `project:${projectId}`,
  jira: () => "jira",
  jiraIssue: (issueIdOrKey: string) => `jiraIssue:${issueIdOrKey}`,
  jiraComponents: () => "jiraComponents",
  jiraUsers: () => "jiraUsers",
};

const LEGACY_VIEW_PREFIXES = [
  "inbox",
  "team:",
  "reportDay:",
  "reportProjects:",
  "reportUnscheduled:",
  "reportInbox:",
  "reportJira:",
] as const;

function isLegacyViewKey(key: string): boolean {
  if (key === "inbox") {
    return true;
  }
  return LEGACY_VIEW_PREFIXES.some(
    (prefix) => prefix !== "inbox" && key.startsWith(prefix),
  );
}

export function parseViewKey(key: string): SyncView | null {
  if (isLegacyViewKey(key)) {
    return { type: "unscheduled" };
  }
  if (key === "unscheduled") {
    return { type: "unscheduled" };
  }
  if (key.startsWith("requests:")) {
    const space = key.slice("requests:".length);
    if (!space) {
      return null;
    }
    return { type: "requests", space };
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
  if (key.startsWith("project:")) {
    return { type: "project", projectId: key.slice(8) };
  }
  if (key.startsWith("day:")) {
    return { type: "day", date: key.slice(4) };
  }
  if (key.startsWith("taskDetail:")) {
    return { type: "taskDetail", taskId: key.slice(11) };
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
  "notification.upsert",
  "notification.pulse",
  "notification.readAll",
  "project.upsert",
  "project.delete",
  "jira.connection",
  "jira.issue.upsert",
  "jira.issue.delete",
  "jira.comment.upsert",
  "jira.link.upsert",
  "jira.link.delete",
  "jira.user.upsert",
  "jira.component.upsert",
  "space.upsert",
  "space.revoked",
  "request.upsert",
  "request.delete",
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
    type: z.literal("task.moveToSpace"),
    body: moveTaskToSpaceRequestSchema,
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
  z.object({
    type: z.literal("request.send"),
    id: z.uuid(),
    body: requestSendBodySchema,
  }),
  z.object({
    type: z.literal("request.reassign"),
    id: z.uuid(),
    body: requestReassignBodySchema,
  }),
  z.object({
    type: z.literal("request.propose"),
    id: z.uuid(),
    body: requestProposeBodySchema,
  }),
  z.object({
    type: z.literal("request.accept"),
    body: requestAcceptBodySchema,
  }),
  z.object({
    type: z.literal("request.decline"),
    body: requestDeclineBodySchema,
  }),
  z.object({
    type: z.literal("request.withdraw"),
    body: requestWithdrawBodySchema,
  }),
  z.object({
    type: z.literal("request.returned.take"),
    body: requestReturnedTakeBodySchema,
  }),
  z.object({
    type: z.literal("request.returned.resend"),
    id: z.uuid(),
    body: requestReturnedResendBodySchema,
  }),
  z.object({
    type: z.literal("request.returned.discard"),
    body: requestReturnedDiscardBodySchema,
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
