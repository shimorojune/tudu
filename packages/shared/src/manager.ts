import { z } from "zod";
import { bucketSchema, type Bucket, type Task } from "./tasks.js";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

export const INBOX_ITEM_STATUSES = ["pending", "accepted", "declined"] as const;
export type InboxItemStatus = (typeof INBOX_ITEM_STATUSES)[number];

export const INVITE_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "cancelled",
] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export const INBOX_CARD_KINDS = ["assigned", "returned"] as const;
export type InboxCardKind = (typeof INBOX_CARD_KINDS)[number];

export type ManagerAction = "see" | "comment" | "reorder" | "delete" | "edit";

export type ManagerPermissions = {
  canSeeDay: boolean;
  canSendInbox: boolean;
  canComment: boolean;
  canReorder: boolean;
  canDelete: boolean;
  canEdit: boolean;
  canComplete: boolean;
  canSeePrivate: boolean;
  canEditDeadlines: boolean;
};

export const DEFAULT_MANAGER_PERMISSIONS: ManagerPermissions = {
  canSeeDay: true,
  canSendInbox: true,
  canComment: true,
  canReorder: true,
  canDelete: true,
  canEdit: false,
  canComplete: false,
  canSeePrivate: false,
  canEditDeadlines: false,
};

export function permitManagerAction(
  permissions: ManagerPermissions,
  action: ManagerAction,
): boolean {
  switch (action) {
    case "see":
      return permissions.canSeeDay;
    case "comment":
      return permissions.canComment;
    case "reorder":
      return permissions.canReorder;
    case "delete":
      return permissions.canDelete;
    case "edit":
      return permissions.canEdit;
  }
}

export function acceptScheduledDate(
  startDate: string | null,
  today: string,
): string {
  return startDate ?? today;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function inboxCardKind(args: {
  fromUserId: string;
  actorManagerId: string | null;
}): InboxCardKind {
  if (args.actorManagerId && args.fromUserId === args.actorManagerId) {
    return "assigned";
  }

  return "returned";
}

export function canDeclineInboxCard(kind: InboxCardKind): boolean {
  return kind === "assigned";
}

export function personFirstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Someone";
  }
  return trimmed.split(/\s+/)[0]!;
}

export function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

export const personSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

export type Person = z.infer<typeof personSchema>;

export type InboxPendingItem = {
  id: string;
  kind: InboxCardKind;
  from: Person;
  task: Task;
  declineReason: string | null;
  createdAt: string;
};

export type InboxHistoryItem = {
  id: string;
  status: "accepted" | "declined";
  title: string;
  from: Person;
  bucket: Bucket | null;
  declineReason: string | null;
  createdAt: string;
};

export type InboxResponse = {
  pending: InboxPendingItem[];
  history: InboxHistoryItem[];
  count: number;
};

export const acceptInboxRequestSchema = z.object({
  bucket: bucketSchema,
});

export type AcceptInboxRequest = z.infer<typeof acceptInboxRequestSchema>;

export const declineInboxRequestSchema = z.object({
  reason: z.string().trim().min(1, "A decline needs a reason").max(500),
});

export type DeclineInboxRequest = z.infer<typeof declineInboxRequestSchema>;

export const createInviteRequestSchema = z.object({
  email: z.email().transform((value) => normalizeInviteEmail(value)),
});

export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

export const sendInboxTaskRequestSchema = z.object({
  title: z.string().trim().min(1, "A task needs a title").max(500),
  description: z
    .string()
    .trim()
    .max(5000)
    .nullable()
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  startDate: isoDateSchema.nullable().optional().default(null),
  deadline: z.iso.datetime({ offset: true }).nullable().optional().default(null),
  projectId: z.uuid().optional(),
});

export type SendInboxTaskRequest = z.infer<typeof sendInboxTaskRequestSchema>;

export type TeamReportRow = {
  user: Person;
  nowCount: number;
  openCount: number;
  slippingCount: number;
  nowTitle: string | null;
};

export type TeamInvite = {
  id: string;
  email: string;
  direction: "outgoing" | "incoming";
  inviter: Person;
  createdAt: string;
};

export type TeamResponse = {
  reports: TeamReportRow[];
  manager: Person | null;
  outgoingInvites: TeamInvite[];
  incomingInvites: TeamInvite[];
};

export type ReportDayResponse = {
  report: Person;
  date: string;
  tasks: Task[];
  slippingCount: number;
};

export type InboxCountResponse = { count: number };
