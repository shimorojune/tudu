import { createHash, randomBytes } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
} from "drizzle-orm";
import {
  DEFAULT_ORG_COLOR,
  emailAllowed,
  normalizeDomains,
  slugify,
  withCollisionSuffix,
  type OrgAuditEntry,
  type OrgDetail,
  type OrgInviteSummary,
  type OrgJoinRequestSummary,
  type OrgMemberSummary,
  type OrgRole,
  type SpaceColor,
  type SpaceListItem,
} from "@tudu/shared";
import { user } from "./auth-schema.js";
import { unreadNotificationCountsByOrg } from "./notifications.js";
import {
  AccessError,
  assertMemberIds,
  liveOrgMemberUserIds,
  requireMember,
  requireOwner,
} from "./access.js";
import type { Db } from "./index.js";
import {
  orgAuditLog,
  orgInvites,
  orgJoinRequests,
  orgMembers,
  orgs,
  type OrgRow,
} from "./orgs-schema.js";
import { taskRequests } from "./task-requests-schema.js";
import { tasks } from "./tasks-schema.js";
import { emitSync } from "./sync.js";

const INVITE_LIMIT = 50;
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class OrgActionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OrgActionError";
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

function joinCodeSuffix(): string {
  return randomBytes(3).toString("hex");
}

function mapAccessError(error: AccessError): OrgActionError {
  const status =
    error.code === "ORG_OWNER_REQUIRED"
      ? 403
      : error.code === "NOT_A_MEMBER"
        ? 422
        : 404;
  return new OrgActionError(error.code, error.message, status);
}

async function writeAudit(
  db: Db,
  orgId: string,
  kind: (typeof orgAuditLog.$inferInsert)["kind"],
  actorId: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(orgAuditLog).values({
    orgId,
    actorId,
    kind,
    payload,
  });
}

async function allocateSlug(db: Db, name: string): Promise<string> {
  const base = slugify(name);
  const rows = await db.select({ slug: orgs.slug }).from(orgs);
  const taken = new Set(rows.map((row) => row.slug));
  return withCollisionSuffix(base, taken);
}

function inviteStatus(
  row: typeof orgInvites.$inferSelect,
  now = new Date(),
): OrgInviteSummary["status"] {
  if (row.status === "pending" && row.expiresAt < now) {
    return "expired";
  }
  return row.status;
}

export type CreateOrgInput = {
  name: string;
  color?: SpaceColor;
  joinLinkEnabled?: boolean;
};

export async function createOrg(
  db: Db,
  userId: string,
  input: CreateOrgInput,
): Promise<OrgRow> {
  const name = input.name.trim();
  if (!name || name.length > 60) {
    throw new OrgActionError("VALIDATION", "Invalid organization name", 422);
  }
  const slug = await allocateSlug(db, name);
  const joinCode = `${slug}-${joinCodeSuffix()}`;
  const color = input.color ?? DEFAULT_ORG_COLOR;

  const [org] = await db
    .insert(orgs)
    .values({
      slug,
      name,
      color,
      joinCode,
      joinLinkEnabled: input.joinLinkEnabled ?? false,
      createdBy: userId,
    })
    .returning();

  await db.insert(orgMembers).values({
    orgId: org.id,
    userId,
    role: "owner",
  });

  await writeAudit(db, org.id, "org_created", userId, { name, slug });
  return org;
}

export type UpdateOrgInput = {
  name?: string;
  color?: SpaceColor;
  allowedDomains?: string[];
  joinLinkEnabled?: boolean;
};

export async function updateOrg(
  db: Db,
  userId: string,
  orgSlug: string,
  input: UpdateOrgInput,
): Promise<OrgRow> {
  let live: Awaited<ReturnType<typeof requireOwner>>;
  try {
    live = await requireOwner(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const patch: Partial<typeof orgs.$inferInsert> = {};
  const audits: Array<{
    kind: (typeof orgAuditLog.$inferInsert)["kind"];
    payload: Record<string, unknown>;
  }> = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 60) {
      throw new OrgActionError("VALIDATION", "Invalid organization name", 422);
    }
    if (name !== live.org.name) {
      patch.name = name;
      audits.push({ kind: "renamed", payload: { from: live.org.name, to: name } });
    }
  }

  if (input.color !== undefined && input.color !== live.org.color) {
    patch.color = input.color;
    audits.push({
      kind: "color_changed",
      payload: { from: live.org.color, to: input.color },
    });
  }

  if (input.allowedDomains !== undefined) {
    const domains = normalizeDomains(input.allowedDomains);
    if (
      JSON.stringify(domains) !== JSON.stringify(live.org.allowedDomains)
    ) {
      patch.allowedDomains = domains;
      audits.push({ kind: "domains_changed", payload: { domains } });
    }
  }

  if (
    input.joinLinkEnabled !== undefined &&
    input.joinLinkEnabled !== live.org.joinLinkEnabled
  ) {
    patch.joinLinkEnabled = input.joinLinkEnabled;
    audits.push({
      kind: input.joinLinkEnabled ? "join_link_enabled" : "join_link_disabled",
      payload: {},
    });
  }

  if (Object.keys(patch).length === 0) {
    return live.org;
  }

  const [updated] = await db
    .update(orgs)
    .set(patch)
    .where(eq(orgs.id, live.org.id))
    .returning();

  for (const audit of audits) {
    await writeAudit(db, live.org.id, audit.kind, userId, audit.payload);
  }

  return updated;
}

async function countPersonalTasks(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.orgId),
        isNull(tasks.deletedAt),
        isNull(tasks.pendingRequestId),
      ),
    );
  return Number(row?.value ?? 0);
}

async function memberCount(db: Db, orgId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), isNull(orgMembers.leftAt)));
  return Number(row?.value ?? 0);
}

export async function listSpacesForUser(
  db: Db,
  userId: string,
): Promise<SpaceListItem[]> {
  const personalTasks = await countPersonalTasks(db, userId);
  const unreadByOrg = await unreadNotificationCountsByOrg(db, userId);
  const spaces: SpaceListItem[] = [
    {
      kind: "personal",
      name: "Personal",
      taskCount: personalTasks,
      unreadCount: 0,
    },
  ];

  const memberships = await db.query.orgMembers.findMany({
    where: and(eq(orgMembers.userId, userId), isNull(orgMembers.leftAt)),
    with: { org: true },
    orderBy: [asc(orgMembers.joinedAt)],
  });

  for (const membership of memberships) {
    const org = membership.org;
    spaces.push({
      kind: "org",
      orgId: org.id,
      slug: org.slug,
      name: org.name,
      color: org.color,
      role: membership.role,
      memberCount: await memberCount(db, org.id),
      hasLogo: org.logoStorageKey !== null,
      unreadCount: unreadByOrg.get(org.id) ?? 0,
      joinedAt: membership.joinedAt.toISOString(),
    });
  }

  return spaces;
}

export async function getOrgDetail(
  db: Db,
  userId: string,
  orgSlug: string,
): Promise<OrgDetail> {
  let live: Awaited<ReturnType<typeof requireMember>>;
  try {
    live = await requireMember(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const owners = await db
    .select({ value: count() })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.orgId, live.org.id),
        eq(orgMembers.role, "owner"),
        isNull(orgMembers.leftAt),
      ),
    );

  const pendingInvites = await db
    .select({ value: count() })
    .from(orgInvites)
    .where(
      and(eq(orgInvites.orgId, live.org.id), eq(orgInvites.status, "pending")),
    );

  const pendingJoin = await db
    .select({ value: count() })
    .from(orgJoinRequests)
    .where(
      and(
        eq(orgJoinRequests.orgId, live.org.id),
        eq(orgJoinRequests.status, "pending"),
      ),
    );

  const membersOutside = await countMembersOutsideDomains(
    db,
    live.org.id,
    live.org.allowedDomains,
  );

  return {
    id: live.org.id,
    slug: live.org.slug,
    name: live.org.name,
    color: live.org.color,
    hasLogo: live.org.logoStorageKey !== null,
    joinLinkEnabled: live.org.joinLinkEnabled,
    joinCode: live.org.joinCode,
    allowedDomains: live.org.allowedDomains,
    role: live.membership.role,
    memberCount: await memberCount(db, live.org.id),
    ownerCount: Number(owners[0]?.value ?? 0),
    pendingInviteCount: Number(pendingInvites[0]?.value ?? 0),
    pendingJoinCount: Number(pendingJoin[0]?.value ?? 0),
    membersOutsideDomains: membersOutside,
    createdAt: live.org.createdAt.toISOString(),
    updatedAt: live.org.updatedAt.toISOString(),
  };
}

export async function countMembersOutsideDomains(
  db: Db,
  orgId: string,
  allowedDomains: string[],
): Promise<number> {
  if (allowedDomains.length === 0) {
    return 0;
  }
  const members = await db.query.orgMembers.findMany({
    where: and(eq(orgMembers.orgId, orgId), isNull(orgMembers.leftAt)),
    with: { user: { columns: { email: true } } },
  });
  return members.filter(
    (row) => !emailAllowed(row.user.email, allowedDomains),
  ).length;
}

export async function listOrgMembers(
  db: Db,
  userId: string,
  orgSlug: string,
): Promise<OrgMemberSummary[]> {
  let live: Awaited<ReturnType<typeof requireMember>>;
  try {
    live = await requireMember(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const rows = await db.query.orgMembers.findMany({
    where: and(eq(orgMembers.orgId, live.org.id), isNull(orgMembers.leftAt)),
    with: { user: true },
    orderBy: [asc(orgMembers.joinedAt)],
  });

  return rows.map((row) => ({
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
  }));
}

export type CreateInviteInput = {
  email: string;
  role: OrgRole;
};

export type CreateInviteResult = {
  invite: typeof orgInvites.$inferSelect;
  token: string;
};

export async function createOrgInvite(
  db: Db,
  userId: string,
  orgSlug: string,
  input: CreateInviteInput,
): Promise<CreateInviteResult> {
  let live: Awaited<ReturnType<typeof requireMember>>;
  try {
    live = await requireMember(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  if (input.role === "owner" && live.membership.role !== "owner") {
    throw new OrgActionError(
      "ORG_OWNER_REQUIRED",
      "Owner required",
      403,
    );
  }

  if (!emailAllowed(input.email, live.org.allowedDomains)) {
    throw new OrgActionError(
      "DOMAIN_NOT_ALLOWED",
      "Email domain is not allowed",
      422,
    );
  }

  const memberByEmail = await db.query.user.findFirst({
    where: eq(user.email, input.email),
    columns: { id: true },
  });
  if (memberByEmail) {
    const liveMember = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.orgId, live.org.id),
        eq(orgMembers.userId, memberByEmail.id),
        isNull(orgMembers.leftAt),
      ),
    });
    if (liveMember) {
      throw new OrgActionError(
        "ALREADY_MEMBER",
        "Already a member",
        409,
      );
    }
  }

  const [pendingCountRow] = await db
    .select({ value: count() })
    .from(orgInvites)
    .where(
      and(eq(orgInvites.orgId, live.org.id), eq(orgInvites.status, "pending")),
    );
  if (Number(pendingCountRow?.value ?? 0) >= INVITE_LIMIT) {
    throw new OrgActionError("INVITE_LIMIT", "Too many pending invites", 409);
  }

  const duplicate = await db.query.orgInvites.findFirst({
    where: and(
      eq(orgInvites.orgId, live.org.id),
      eq(orgInvites.email, input.email),
      eq(orgInvites.status, "pending"),
    ),
  });
  if (duplicate) {
    throw new OrgActionError(
      "VALIDATION",
      "Invite already pending for this email",
      409,
    );
  }

  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [invite] = await db
    .insert(orgInvites)
    .values({
      orgId: live.org.id,
      email: input.email,
      role: input.role,
      invitedBy: userId,
      tokenHash: hashToken(token),
      expiresAt,
    })
    .returning();

  await writeAudit(db, live.org.id, "invite_sent", userId, {
    email: input.email,
    role: input.role,
  });

  return { invite, token };
}

export async function resendOrgInvite(
  db: Db,
  userId: string,
  orgSlug: string,
  inviteId: string,
): Promise<{ token: string; invite: typeof orgInvites.$inferSelect }> {
  let live: Awaited<ReturnType<typeof requireMember>>;
  try {
    live = await requireMember(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const invite = await db.query.orgInvites.findFirst({
    where: and(eq(orgInvites.id, inviteId), eq(orgInvites.orgId, live.org.id)),
  });
  if (!invite || invite.status !== "pending") {
    throw new OrgActionError("VALIDATION", "Invite not found", 404);
  }

  const canResend =
    live.membership.role === "owner" || invite.invitedBy === userId;
  if (!canResend) {
    throw new OrgActionError("ORG_OWNER_REQUIRED", "Not allowed", 403);
  }

  const elapsed = Date.now() - invite.lastSentAt.getTime();
  if (elapsed < RESEND_COOLDOWN_MS) {
    throw new OrgActionError("RATE_LIMITED", "Resend too soon", 429);
  }

  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [updated] = await db
    .update(orgInvites)
    .set({
      tokenHash: hashToken(token),
      expiresAt,
      lastSentAt: new Date(),
    })
    .where(eq(orgInvites.id, inviteId))
    .returning();

  await writeAudit(db, live.org.id, "invite_resent", userId, {
    email: invite.email,
  });

  return { token, invite: updated };
}

export async function revokeOrgInvite(
  db: Db,
  userId: string,
  orgSlug: string,
  inviteId: string,
): Promise<void> {
  let live: Awaited<ReturnType<typeof requireMember>>;
  try {
    live = await requireMember(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const invite = await db.query.orgInvites.findFirst({
    where: and(eq(orgInvites.id, inviteId), eq(orgInvites.orgId, live.org.id)),
  });
  if (!invite || invite.status !== "pending") {
    throw new OrgActionError("VALIDATION", "Invite not found", 404);
  }

  const canRevoke =
    live.membership.role === "owner" || invite.invitedBy === userId;
  if (!canRevoke) {
    throw new OrgActionError("ORG_OWNER_REQUIRED", "Not allowed", 403);
  }

  await db
    .update(orgInvites)
    .set({ status: "revoked", decidedAt: new Date() })
    .where(eq(orgInvites.id, inviteId));

  await writeAudit(db, live.org.id, "invite_revoked", userId, {
    email: invite.email,
  });
}

async function loadInviteByToken(db: Db, token: string) {
  return db.query.orgInvites.findFirst({
    where: eq(orgInvites.tokenHash, hashToken(token)),
    with: {
      org: true,
    },
  });
}

export async function getInvitePreview(db: Db, token: string) {
  const invite = await loadInviteByToken(db, token);
  if (!invite) {
    throw new OrgActionError("ORG_NOT_FOUND", "Invite not found", 404);
  }
  const inviter = await db.query.user.findFirst({
    where: eq(user.id, invite.invitedBy),
    columns: { name: true },
  });
  return {
    orgName: invite.org.name,
    color: invite.org.color,
    hasLogo: invite.org.logoStorageKey !== null,
    inviterName: inviter?.name ?? null,
    invitedEmail: invite.email,
    status: inviteStatus(invite),
  };
}

export async function acceptOrgInvite(
  db: Db,
  userId: string,
  userEmail: string,
  token: string,
): Promise<{ orgSlug: string }> {
  const invite = await loadInviteByToken(db, token);
  if (!invite) {
    throw new OrgActionError("ORG_NOT_FOUND", "Invite not found", 404);
  }
  if (invite.status === "revoked") {
    throw new OrgActionError("INVITE_REVOKED", "Invite revoked", 410);
  }
  if (invite.status !== "pending" || invite.expiresAt < new Date()) {
    throw new OrgActionError("INVITE_EXPIRED", "Invite expired", 410);
  }
  if (userEmail.toLowerCase() !== invite.email.toLowerCase()) {
    throw new OrgActionError(
      "INVITE_EMAIL_MISMATCH",
      "Signed in with a different email",
      403,
    );
  }
  if (!emailAllowed(userEmail, invite.org.allowedDomains)) {
    throw new OrgActionError(
      "DOMAIN_NOT_ALLOWED",
      "Email domain is not allowed",
      422,
    );
  }

  const existing = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.orgId, invite.orgId),
      eq(orgMembers.userId, userId),
      isNull(orgMembers.leftAt),
    ),
  });
  if (existing) {
    await db
      .update(orgInvites)
      .set({ status: "accepted", decidedAt: new Date() })
      .where(eq(orgInvites.id, invite.id));
    throw new OrgActionError("ALREADY_MEMBER", "Already a member", 409);
  }

  await db.insert(orgMembers).values({
    orgId: invite.orgId,
    userId,
    role: invite.role,
  });

  await db
    .update(orgInvites)
    .set({ status: "accepted", decidedAt: new Date() })
    .where(eq(orgInvites.id, invite.id));

  await writeAudit(db, invite.orgId, "invite_accepted", userId, {
    email: invite.email,
  });

  return { orgSlug: invite.org.slug };
}

export async function listMyPendingInvites(
  db: Db,
  userEmail: string,
): Promise<
  Array<{
    id: string;
    token: string;
    orgName: string;
    orgSlug: string;
    color: SpaceColor;
    hasLogo: boolean;
    role: OrgRole;
    inviterName: string | null;
    expiresAt: string;
  }>
> {
  const email = userEmail.toLowerCase();
  const rows = await db.query.orgInvites.findMany({
    where: and(eq(orgInvites.email, email), eq(orgInvites.status, "pending")),
    with: { org: true },
  });
  const now = new Date();
  const out: Array<{
    id: string;
    token: string;
    orgName: string;
    orgSlug: string;
    color: SpaceColor;
    hasLogo: boolean;
    role: OrgRole;
    inviterName: string | null;
    expiresAt: string;
  }> = [];

  for (const row of rows) {
    if (row.expiresAt < now) {
      continue;
    }
    out.push({
      id: row.id,
      token: "",
      orgName: row.org.name,
      orgSlug: row.org.slug,
      color: row.org.color,
      hasLogo: row.org.logoStorageKey !== null,
      role: row.role,
      inviterName: null,
      expiresAt: row.expiresAt.toISOString(),
    });
  }
  return out;
}

export async function findOrgByJoinCode(
  db: Db,
  code: string,
): Promise<OrgRow | undefined> {
  return db.query.orgs.findFirst({ where: eq(orgs.joinCode, code) });
}

export async function getJoinPreview(db: Db, code: string) {
  const org = await findOrgByJoinCode(db, code);
  if (!org) {
    throw new OrgActionError("ORG_NOT_FOUND", "Join link not found", 404);
  }
  return {
    orgName: org.name,
    color: org.color,
    hasLogo: org.logoStorageKey !== null,
    joinLinkEnabled: org.joinLinkEnabled,
  };
}

export async function createJoinRequest(
  db: Db,
  userId: string,
  userEmail: string,
  code: string,
): Promise<void> {
  const org = await findOrgByJoinCode(db, code);
  if (!org) {
    throw new OrgActionError("ORG_NOT_FOUND", "Join link not found", 404);
  }
  if (!org.joinLinkEnabled) {
    throw new OrgActionError("JOIN_LINK_OFF", "Join link is off", 410);
  }
  if (!emailAllowed(userEmail, org.allowedDomains)) {
    throw new OrgActionError(
      "DOMAIN_NOT_ALLOWED",
      "Email domain is not allowed",
      422,
    );
  }

  const member = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.orgId, org.id),
      eq(orgMembers.userId, userId),
      isNull(orgMembers.leftAt),
    ),
  });
  if (member) {
    throw new OrgActionError("ALREADY_MEMBER", "Already a member", 409);
  }

  const pending = await db.query.orgJoinRequests.findFirst({
    where: and(
      eq(orgJoinRequests.orgId, org.id),
      eq(orgJoinRequests.userId, userId),
      eq(orgJoinRequests.status, "pending"),
    ),
  });
  if (pending) {
    throw new OrgActionError("JOIN_PENDING", "Join request already pending", 409);
  }

  await db.insert(orgJoinRequests).values({ orgId: org.id, userId });
  await writeAudit(db, org.id, "join_requested", userId, {});
}

export async function regenerateJoinLink(
  db: Db,
  userId: string,
  orgSlug: string,
): Promise<{ joinCode: string }> {
  let live: Awaited<ReturnType<typeof requireOwner>>;
  try {
    live = await requireOwner(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const joinCode = `${live.org.slug}-${joinCodeSuffix()}`;
  await db.update(orgs).set({ joinCode }).where(eq(orgs.id, live.org.id));
  await writeAudit(db, live.org.id, "join_link_regenerated", userId, {});
  return { joinCode };
}

export async function approveJoinRequest(
  db: Db,
  userId: string,
  orgSlug: string,
  requestId: string,
): Promise<void> {
  let live: Awaited<ReturnType<typeof requireOwner>>;
  try {
    live = await requireOwner(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const request = await db.query.orgJoinRequests.findFirst({
    where: and(
      eq(orgJoinRequests.id, requestId),
      eq(orgJoinRequests.orgId, live.org.id),
    ),
    with: { user: true },
  });
  if (!request || request.status !== "pending") {
    throw new OrgActionError("VALIDATION", "Join request not found", 404);
  }

  if (!emailAllowed(request.user.email, live.org.allowedDomains)) {
    throw new OrgActionError(
      "DOMAIN_NOT_ALLOWED",
      "Email domain is not allowed",
      422,
    );
  }

  await db.insert(orgMembers).values({
    orgId: live.org.id,
    userId: request.userId,
    role: "member",
  });

  await db
    .update(orgJoinRequests)
    .set({
      status: "approved",
      decidedBy: userId,
      decidedAt: new Date(),
    })
    .where(eq(orgJoinRequests.id, requestId));

  await writeAudit(db, live.org.id, "join_approved", userId, {
    userId: request.userId,
  });
}

export async function declineJoinRequest(
  db: Db,
  userId: string,
  orgSlug: string,
  requestId: string,
): Promise<void> {
  let live: Awaited<ReturnType<typeof requireOwner>>;
  try {
    live = await requireOwner(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const request = await db.query.orgJoinRequests.findFirst({
    where: and(
      eq(orgJoinRequests.id, requestId),
      eq(orgJoinRequests.orgId, live.org.id),
      eq(orgJoinRequests.status, "pending"),
    ),
  });
  if (!request) {
    throw new OrgActionError("VALIDATION", "Join request not found", 404);
  }

  await db
    .update(orgJoinRequests)
    .set({
      status: "declined",
      decidedBy: userId,
      decidedAt: new Date(),
    })
    .where(eq(orgJoinRequests.id, requestId));

  await writeAudit(db, live.org.id, "join_declined", userId, {
    userId: request.userId,
  });
}

async function ownerCount(db: Db, orgId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.role, "owner"),
        isNull(orgMembers.leftAt),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function updateMemberRole(
  db: Db,
  actorId: string,
  orgSlug: string,
  targetUserId: string,
  role: OrgRole,
): Promise<void> {
  let live: Awaited<ReturnType<typeof requireOwner>>;
  try {
    live = await requireOwner(db, actorId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const target = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.orgId, live.org.id),
      eq(orgMembers.userId, targetUserId),
      isNull(orgMembers.leftAt),
    ),
  });
  if (!target) {
    throw new OrgActionError("NOT_A_MEMBER", "Not a member", 422);
  }

  if (target.role === "owner" && role === "member") {
    const owners = await ownerCount(db, live.org.id);
    if (owners <= 1) {
      throw new OrgActionError("LAST_OWNER", "Cannot demote the last owner", 409);
    }
  }

  await db
    .update(orgMembers)
    .set({ role })
    .where(eq(orgMembers.id, target.id));

  await writeAudit(db, live.org.id, "role_changed", actorId, {
    userId: targetUserId,
    role,
  });
}

async function openOrgTasksForUser(
  db: Db,
  orgId: string,
  userId: string,
): Promise<(typeof tasks.$inferSelect)[]> {
  return db.query.tasks.findMany({
    where: and(
      eq(tasks.orgId, orgId),
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      isNull(tasks.completedAt),
    ),
  });
}

export async function getHandoverPreview(
  db: Db,
  userId: string,
  orgSlug: string,
  subjectUserId: string,
): Promise<{
  openTaskCount: number;
  privateOpenTaskCount: number;
  members: OrgMemberSummary[];
}> {
  let live: Awaited<ReturnType<typeof requireMember>>;
  try {
    live = await requireMember(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const open = await openOrgTasksForUser(db, live.org.id, subjectUserId);
  const members = (await listOrgMembers(db, userId, orgSlug)).filter(
    (member) => member.userId !== subjectUserId,
  );

  return {
    openTaskCount: open.length,
    privateOpenTaskCount: open.filter((task) => task.isPrivate).length,
    members,
  };
}

async function resolveRequestsOnLeave(
  db: Db,
  orgId: string,
  leaverId: string,
): Promise<void> {
  await db
    .update(taskRequests)
    .set({ status: "withdrawn", decidedAt: new Date() })
    .where(
      and(
        eq(taskRequests.orgId, orgId),
        eq(taskRequests.fromUserId, leaverId),
        eq(taskRequests.status, "pending"),
      ),
    );

  await db
    .update(taskRequests)
    .set({
      status: "declined",
      declineReason: "Left the organization",
      decidedAt: new Date(),
    })
    .where(
      and(
        eq(taskRequests.orgId, orgId),
        eq(taskRequests.toUserId, leaverId),
        eq(taskRequests.status, "pending"),
        or(
          eq(taskRequests.kind, "new_task"),
          eq(taskRequests.kind, "reassign"),
        ),
      ),
    );

  const ownedRows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.userId, leaverId), eq(tasks.orgId, orgId)));
  const ownedIds = ownedRows.map((row) => row.id);
  if (ownedIds.length > 0) {
    await db
      .update(taskRequests)
      .set({ status: "outdated", decidedAt: new Date() })
      .where(
        and(
          eq(taskRequests.orgId, orgId),
          eq(taskRequests.status, "pending"),
          eq(taskRequests.kind, "edit"),
          inArray(taskRequests.taskId, ownedIds),
        ),
      );
  }
}

async function handoverTasks(
  db: Db,
  orgId: string,
  fromUserId: string,
  handoverTo: string,
): Promise<number> {
  const open = await openOrgTasksForUser(db, orgId, fromUserId);
  if (open.length === 0) {
    return 0;
  }
  await db
    .update(tasks)
    .set({ userId: handoverTo })
    .where(
      inArray(
        tasks.id,
        open.map((task) => task.id),
      ),
    );
  return open.length;
}

async function markMemberLeft(
  db: Db,
  orgId: string,
  userId: string,
  auditKind: "member_left" | "member_removed",
  actorId: string,
  handoverTo: string | null,
  taskCount: number,
): Promise<void> {
  await db
    .update(orgMembers)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.userId, userId),
        isNull(orgMembers.leftAt),
      ),
    );

  await writeAudit(db, orgId, auditKind, actorId, {
    userId,
    handoverTo,
    taskCount,
  });

  if (taskCount > 0 && handoverTo) {
    await writeAudit(db, orgId, "tasks_handed_over", actorId, {
      fromUserId: userId,
      toUserId: handoverTo,
      taskCount,
    });
  }
}

async function emitSpaceRevoked(
  db: Db,
  recipientUserIds: string[],
  orgId: string,
  orgName: string,
  reason: "left" | "removed" | "deleted",
): Promise<void> {
  await emitSync(db, {
    recipientUserIds,
    clientMutationId: null,
    type: "space.revoked",
    payload: { orgId, orgName, reason },
  });
}

export async function leaveOrg(
  db: Db,
  userId: string,
  orgSlug: string,
  handoverTo?: string,
): Promise<void> {
  let live: Awaited<ReturnType<typeof requireMember>>;
  try {
    live = await requireMember(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  if (live.membership.role === "owner") {
    const owners = await ownerCount(db, live.org.id);
    if (owners <= 1) {
      throw new OrgActionError("LAST_OWNER", "Last owner cannot leave", 409);
    }
  }

  const open = await openOrgTasksForUser(db, live.org.id, userId);
  if (open.length > 0 && !handoverTo) {
    throw new OrgActionError(
      "HANDOVER_REQUIRED",
      "Choose someone to receive your open tasks",
      409,
    );
  }
  if (handoverTo) {
    try {
      await assertMemberIds(db, live.org.id, [handoverTo]);
    } catch (error) {
      if (error instanceof AccessError) {
        throw mapAccessError(error);
      }
      throw error;
    }
    if (handoverTo === userId) {
      throw new OrgActionError("NOT_A_MEMBER", "Invalid handover recipient", 422);
    }
  }

  const handed = handoverTo
    ? await handoverTasks(db, live.org.id, userId, handoverTo)
    : 0;
  await resolveRequestsOnLeave(db, live.org.id, userId);
  await markMemberLeft(
    db,
    live.org.id,
    userId,
    "member_left",
    userId,
    handoverTo ?? null,
    handed,
  );

  await emitSpaceRevoked(db, [userId], live.org.id, live.org.name, "left");
}

export async function removeOrgMember(
  db: Db,
  actorId: string,
  orgSlug: string,
  targetUserId: string,
  handoverTo: string,
): Promise<void> {
  let live: Awaited<ReturnType<typeof requireOwner>>;
  try {
    live = await requireOwner(db, actorId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  if (targetUserId === actorId) {
    throw new OrgActionError(
      "VALIDATION",
      "Use leave to remove yourself",
      422,
    );
  }

  try {
    await assertMemberIds(db, live.org.id, [targetUserId, handoverTo]);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  if (targetUserId === handoverTo) {
    throw new OrgActionError("NOT_A_MEMBER", "Invalid handover recipient", 422);
  }

  const open = await openOrgTasksForUser(db, live.org.id, targetUserId);
  if (open.length > 0 && !handoverTo) {
    throw new OrgActionError("HANDOVER_REQUIRED", "Handover required", 409);
  }

  const handed = await handoverTasks(
    db,
    live.org.id,
    targetUserId,
    handoverTo,
  );
  await resolveRequestsOnLeave(db, live.org.id, targetUserId);
  await markMemberLeft(
    db,
    live.org.id,
    targetUserId,
    "member_removed",
    actorId,
    handoverTo,
    handed,
  );

  await emitSpaceRevoked(
    db,
    [targetUserId],
    live.org.id,
    live.org.name,
    "removed",
  );
}

export async function transferOwnership(
  db: Db,
  actorId: string,
  orgSlug: string,
  toUserId: string,
): Promise<void> {
  let live: Awaited<ReturnType<typeof requireOwner>>;
  try {
    live = await requireOwner(db, actorId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  try {
    await assertMemberIds(db, live.org.id, [toUserId]);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(orgMembers)
      .set({ role: "owner" })
      .where(
        and(
          eq(orgMembers.orgId, live.org.id),
          eq(orgMembers.userId, toUserId),
          isNull(orgMembers.leftAt),
        ),
      );
    await tx
      .update(orgMembers)
      .set({ role: "member" })
      .where(
        and(
          eq(orgMembers.orgId, live.org.id),
          eq(orgMembers.userId, actorId),
          isNull(orgMembers.leftAt),
        ),
      );
  });

  await writeAudit(db, live.org.id, "ownership_transferred", actorId, {
    toUserId,
  });
}

export async function deleteOrg(
  db: Db,
  actorId: string,
  orgSlug: string,
  confirmName: string,
): Promise<{ memberIds: string[]; logoKey: string | null }> {
  let live: Awaited<ReturnType<typeof requireOwner>>;
  try {
    live = await requireOwner(db, actorId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  if (confirmName !== live.org.name) {
    throw new OrgActionError(
      "VALIDATION",
      "Organization name does not match",
      422,
    );
  }

  const memberIds = await liveOrgMemberUserIds(db, live.org.id);
  const logoKey = live.org.logoStorageKey;

  await db.delete(orgs).where(eq(orgs.id, live.org.id));

  await emitSpaceRevoked(
    db,
    memberIds,
    live.org.id,
    live.org.name,
    "deleted",
  );

  return { memberIds, logoKey };
}

export async function listOrgAudit(
  db: Db,
  userId: string,
  orgSlug: string,
  cursor?: string,
): Promise<{ entries: OrgAuditEntry[]; nextCursor: string | null }> {
  let live: Awaited<ReturnType<typeof requireOwner>>;
  try {
    live = await requireOwner(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const conditions = [eq(orgAuditLog.orgId, live.org.id)];
  if (cursor) {
    conditions.push(lt(orgAuditLog.createdAt, new Date(cursor)));
  }

  const rows = await db.query.orgAuditLog.findMany({
    where: and(...conditions),
    orderBy: [desc(orgAuditLog.createdAt)],
    limit: 51,
    with: {
      actor: { columns: { name: true } },
    },
  });

  const page = rows.slice(0, 50);
  const nextCursor =
    rows.length > 50
      ? page[page.length - 1]?.createdAt.toISOString() ?? null
      : null;

  return {
    entries: page.map((row) => ({
      id: row.id,
      kind: row.kind,
      actorId: row.actorId,
      actorName: row.actor?.name ?? null,
      payload: (row.payload as Record<string, unknown>) ?? {},
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor,
  };
}

export async function setOrgLogoKey(
  db: Db,
  userId: string,
  orgSlug: string,
  storageKey: string,
  previousKey: string | null,
): Promise<void> {
  let live: Awaited<ReturnType<typeof requireOwner>>;
  try {
    live = await requireOwner(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  await db
    .update(orgs)
    .set({ logoStorageKey: storageKey })
    .where(eq(orgs.id, live.org.id));

  await writeAudit(db, live.org.id, "logo_changed", userId, {
    previousKey,
    storageKey,
  });
}

export async function clearOrgLogo(
  db: Db,
  userId: string,
  orgSlug: string,
): Promise<string | null> {
  let live: Awaited<ReturnType<typeof requireOwner>>;
  try {
    live = await requireOwner(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const previous = live.org.logoStorageKey;
  await db
    .update(orgs)
    .set({ logoStorageKey: null })
    .where(eq(orgs.id, live.org.id));
  await writeAudit(db, live.org.id, "logo_removed", userId, {});
  return previous;
}

export async function listOrgInvitesAndJoinRequests(
  db: Db,
  userId: string,
  orgSlug: string,
): Promise<{
  invites: OrgInviteSummary[];
  joinRequests: OrgJoinRequestSummary[];
  joinLinkEnabled: boolean;
  joinCode: string;
}> {
  let live: Awaited<ReturnType<typeof requireMember>>;
  try {
    live = await requireMember(db, userId, orgSlug);
  } catch (error) {
    if (error instanceof AccessError) {
      throw mapAccessError(error);
    }
    throw error;
  }

  const inviteRows = await db.query.orgInvites.findMany({
    where: eq(orgInvites.orgId, live.org.id),
    orderBy: [desc(orgInvites.createdAt)],
    with: { inviter: { columns: { name: true } } },
  });

  const joinRows = await db.query.orgJoinRequests.findMany({
    where: and(
      eq(orgJoinRequests.orgId, live.org.id),
      eq(orgJoinRequests.status, "pending"),
    ),
    with: { user: true },
    orderBy: [desc(orgJoinRequests.createdAt)],
  });

  const invites: OrgInviteSummary[] = inviteRows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: inviteStatus(row),
    invitedBy: row.invitedBy,
    inviterName: row.inviter?.name ?? null,
    expiresAt: row.expiresAt.toISOString(),
    lastSentAt: row.lastSentAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    canRevoke:
      live.membership.role === "owner" || row.invitedBy === userId,
    canResend:
      live.membership.role === "owner" || row.invitedBy === userId,
  }));

  const joinRequests: OrgJoinRequestSummary[] = joinRows.map((row) => ({
    id: row.id,
    userId: row.userId,
    userName: row.user.name,
    userEmail: row.user.email,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    invites,
    joinRequests,
    joinLinkEnabled: live.org.joinLinkEnabled,
    joinCode: live.org.joinCode,
  };
}
