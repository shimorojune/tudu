import { z } from "zod";
import type { OrgRole } from "./types.js";
import { SPACE_COLOR_NAMES } from "../colors.js";

export const orgRoleSchema = z.enum(["owner", "member"]);

export const orgNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(60, "Name must be at most 60 characters");

export const spaceColorSchema = z.enum(SPACE_COLOR_NAMES);

export const createOrgBodySchema = z.object({
  name: orgNameSchema,
  color: spaceColorSchema.optional(),
  joinLinkEnabled: z.boolean().optional(),
});

export type CreateOrgBody = z.infer<typeof createOrgBodySchema>;

export const updateOrgBodySchema = z.object({
  name: orgNameSchema.optional(),
  color: spaceColorSchema.optional(),
  allowedDomains: z.array(z.string()).optional(),
  joinLinkEnabled: z.boolean().optional(),
});

export type UpdateOrgBody = z.infer<typeof updateOrgBodySchema>;

export const createOrgInviteBodySchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .transform((value) => value.toLowerCase()),
  role: orgRoleSchema,
});

export type CreateOrgInviteBody = z.infer<typeof createOrgInviteBodySchema>;

export const handoverBodySchema = z.object({
  handoverTo: z.string().min(1).optional(),
});

export type HandoverBody = z.infer<typeof handoverBodySchema>;

export const transferOwnershipBodySchema = z.object({
  toUserId: z.string().min(1),
});

export type TransferOwnershipBody = z.infer<
  typeof transferOwnershipBodySchema
>;

export const updateMemberRoleBodySchema = z.object({
  role: orgRoleSchema,
});

export type UpdateMemberRoleBody = z.infer<typeof updateMemberRoleBodySchema>;

export const deleteOrgBodySchema = z.object({
  confirmName: z.string(),
});

export type DeleteOrgBody = z.infer<typeof deleteOrgBodySchema>;

export type { OrgRole };

export type SpaceListItem = {
  kind: "personal" | "org";
  orgId?: string;
  slug?: string;
  name: string;
  color?: (typeof SPACE_COLOR_NAMES)[number];
  role?: OrgRole;
  memberCount?: number;
  hasLogo?: boolean;
  taskCount?: number;
  unreadCount?: number;
  joinedAt?: string;
};

export type OrgDetail = {
  id: string;
  slug: string;
  name: string;
  color: (typeof SPACE_COLOR_NAMES)[number];
  hasLogo: boolean;
  joinLinkEnabled: boolean;
  joinCode: string;
  allowedDomains: string[];
  role: OrgRole;
  memberCount: number;
  ownerCount: number;
  pendingInviteCount: number;
  pendingJoinCount: number;
  membersOutsideDomains: number;
  createdAt: string;
  updatedAt: string;
};

export type OrgMemberSummary = {
  userId: string;
  name: string | null;
  email: string;
  role: OrgRole;
  joinedAt: string;
};

export type CoworkerRosterEntry = {
  userId: string;
  name: string | null;
  email: string;
  isSelf: boolean;
  nowCount: number;
  openCount: number;
  slippingCount: number;
  nowTitle: string | null;
  lastSeenAt: string | null;
};

export type CoworkerRosterResponse = {
  orgName: string;
  members: CoworkerRosterEntry[];
};

export type CoworkerDayTask = {
  id: string;
  title: string;
  bucket: "now" | "next" | "later" | null;
  position: number;
  completedAt: string | null;
  deadline: string | null;
  carriedDays: number;
};

export type CoworkerDayResponse = {
  orgName: string;
  userId: string;
  userName: string | null;
  scheduledDate: string;
  privateHiddenCount: number;
  nowCount: number;
  nowCap: number;
  tasks: CoworkerDayTask[];
};

export type OrgInviteSummary = {
  id: string;
  email: string;
  role: OrgRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedBy: string;
  inviterName: string | null;
  expiresAt: string;
  lastSentAt: string;
  createdAt: string;
  canRevoke: boolean;
  canResend: boolean;
};

export type OrgJoinRequestSummary = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  status: "pending" | "approved" | "declined";
  createdAt: string;
};

export type OrgInvitesResponse = {
  invites: OrgInviteSummary[];
  joinRequests: OrgJoinRequestSummary[];
  joinLinkEnabled: boolean;
  joinCode: string;
};

export type InvitePreview = {
  orgName: string;
  color: (typeof SPACE_COLOR_NAMES)[number];
  hasLogo: boolean;
  inviterName: string | null;
  invitedEmail: string;
  status: "pending" | "accepted" | "revoked" | "expired";
};

export type JoinPreview = {
  orgName: string;
  color: (typeof SPACE_COLOR_NAMES)[number];
  hasLogo: boolean;
  joinLinkEnabled: boolean;
};

export type MyInviteSummary = {
  id: string;
  token: string;
  orgName: string;
  orgSlug: string;
  color: (typeof SPACE_COLOR_NAMES)[number];
  hasLogo: boolean;
  role: OrgRole;
  inviterName: string | null;
  expiresAt: string;
};

export type OrgAuditEntry = {
  id: string;
  kind: string;
  actorId: string | null;
  actorName: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type OrgAuditResponse = {
  entries: OrgAuditEntry[];
  nextCursor: string | null;
};

export type HandoverPreview = {
  openTaskCount: number;
  privateOpenTaskCount: number;
  members: OrgMemberSummary[];
};

export const ORG_ERROR_CODES = [
  "ORG_NOT_FOUND",
  "ORG_OWNER_REQUIRED",
  "INVITE_EMAIL_MISMATCH",
  "LAST_OWNER",
  "ALREADY_MEMBER",
  "HANDOVER_REQUIRED",
  "INVITE_LIMIT",
  "JOIN_PENDING",
  "INVITE_EXPIRED",
  "INVITE_REVOKED",
  "JOIN_LINK_OFF",
  "DOMAIN_NOT_ALLOWED",
  "NOT_A_MEMBER",
  "VALIDATION",
  "LOGO_INVALID",
  "RATE_LIMITED",
] as const;

export type OrgErrorCode = (typeof ORG_ERROR_CODES)[number];
