import { z } from "zod";
import { bucketSchema } from "../tasks.js";
import type { ProposalFields } from "./requests.js";
import type { SpaceColor } from "../colors.js";
import type { Task } from "../tasks.js";
import type { TaskRequestKind, TaskRequestStatus } from "./types.js";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

const messageSchema = z.string().trim().max(500).nullable().optional();

const placementSchema = z.object({
  scheduledDate: isoDateSchema,
  bucket: bucketSchema,
  index: z.number().int().min(0).optional(),
});

export const proposalFieldsSchema = z.object({
  placement: placementSchema.optional(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z
    .string()
    .trim()
    .max(5000)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value)),
  deadline: z.iso.datetime({ offset: true }).nullable().optional(),
  completed: z.boolean().optional(),
  jiraIssueKey: z.string().trim().min(1).nullable().optional(),
});

export type ProposalFieldsInput = z.infer<typeof proposalFieldsSchema>;

export const requestSendBodySchema = z.object({
  orgId: z.uuid(),
  toUserId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  description: z
    .string()
    .trim()
    .max(5000)
    .nullable()
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  suggestedBucket: bucketSchema.nullable().optional(),
  suggestedDeadline: z.iso.datetime({ offset: true }).nullable().optional(),
  subtasks: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
  jiraIssueKey: z.string().trim().min(1).nullable().optional(),
  message: messageSchema,
});

export type RequestSendBody = z.infer<typeof requestSendBodySchema>;

export const requestReassignBodySchema = z.object({
  taskId: z.uuid(),
  toUserId: z.string().min(1),
  message: messageSchema,
});

export type RequestReassignBody = z.infer<typeof requestReassignBodySchema>;

export const requestProposeBodySchema = z.object({
  taskId: z.uuid(),
  fields: proposalFieldsSchema,
  message: messageSchema,
});

export type RequestProposeBody = z.infer<typeof requestProposeBodySchema>;

export const requestAcceptBodySchema = z.object({
  requestId: z.uuid(),
  fields: z.array(z.string()).optional(),
  bucket: bucketSchema.optional(),
});

export type RequestAcceptBody = z.infer<typeof requestAcceptBodySchema>;

export const requestDeclineBodySchema = z.object({
  requestId: z.uuid(),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const requestWithdrawBodySchema = z.object({
  requestId: z.uuid(),
});

export type RequestDeclineBody = z.infer<typeof requestDeclineBodySchema>;

export const requestReturnedTakeBodySchema = z.object({
  requestId: z.uuid(),
  bucket: bucketSchema,
});

export type RequestReturnedTakeBody = z.infer<typeof requestReturnedTakeBodySchema>;

export const requestReturnedResendBodySchema = z.object({
  requestId: z.uuid(),
  toUserId: z.string().min(1),
});

export type RequestReturnedResendBody = z.infer<typeof requestReturnedResendBodySchema>;

export const requestReturnedDiscardBodySchema = z.object({
  requestId: z.uuid(),
});

export type TaskRequestPerson = {
  id: string;
  name: string | null;
  email: string;
};

export type TaskRequestView = {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  orgColor: SpaceColor;
  kind: TaskRequestKind;
  status: TaskRequestStatus;
  from: TaskRequestPerson;
  to: TaskRequestPerson;
  task: Task;
  proposal: ProposalFields;
  baseline: ProposalFields;
  message: string | null;
  declineReason: string | null;
  acceptedFields: string[] | null;
  createdAt: string;
  decidedAt: string | null;
};

export const PERSONAL_REQUESTS_SPACE = "personal";

export const REQUEST_ERROR_CODES = [
  "REQUEST_NOT_PENDING",
  "REASSIGN_PENDING",
  "NOW_CAP_REACHED",
  "JIRA_NOT_CONNECTED",
  "NOT_A_MEMBER",
  "VALIDATION",
] as const;

export type RequestErrorCode = (typeof REQUEST_ERROR_CODES)[number];
