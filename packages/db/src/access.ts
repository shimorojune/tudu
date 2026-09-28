import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "./index.js";
import { orgMembers, orgs } from "./orgs-schema.js";
import { tasks } from "./tasks-schema.js";

export class AccessError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

export type LiveMembership = {
  org: typeof orgs.$inferSelect;
  membership: typeof orgMembers.$inferSelect;
};

export async function requireMemberByOrgId(
  db: Db,
  userId: string,
  orgId: string,
): Promise<LiveMembership> {
  const org = await db.query.orgs.findFirst({
    where: eq(orgs.id, orgId),
  });
  if (!org) {
    throw new AccessError("ORG_NOT_FOUND", "Organization not found");
  }
  const membership = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.orgId, orgId),
      eq(orgMembers.userId, userId),
      isNull(orgMembers.leftAt),
    ),
  });
  if (!membership) {
    throw new AccessError("ORG_NOT_FOUND", "Organization not found");
  }
  return { org, membership };
}

export async function requireMember(
  db: Db,
  userId: string,
  orgSlug: string,
): Promise<LiveMembership> {
  const org = await db.query.orgs.findFirst({
    where: eq(orgs.slug, orgSlug),
  });
  if (!org) {
    throw new AccessError("ORG_NOT_FOUND", "Organization not found");
  }
  const membership = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.orgId, org.id),
      eq(orgMembers.userId, userId),
      isNull(orgMembers.leftAt),
    ),
  });
  if (!membership) {
    throw new AccessError("ORG_NOT_FOUND", "Organization not found");
  }
  return { org, membership };
}

export async function requireOwner(
  db: Db,
  userId: string,
  orgSlug: string,
): Promise<LiveMembership> {
  const live = await requireMember(db, userId, orgSlug);
  if (live.membership.role !== "owner") {
    throw new AccessError("ORG_OWNER_REQUIRED", "Owner required");
  }
  return live;
}

export type TaskAccess = "owner" | "reader" | null;

export async function resolveTaskAccess(
  db: Db,
  userId: string,
  taskId: string,
): Promise<TaskAccess> {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), isNull(tasks.deletedAt)),
    columns: {
      userId: true,
      orgId: true,
      isPrivate: true,
      pendingRequestId: true,
    },
  });
  if (!task) {
    return null;
  }
  if (task.userId === userId) {
    return "owner";
  }
  if (task.pendingRequestId !== null) {
    return null;
  }
  if (task.isPrivate || task.orgId === null) {
    return null;
  }
  const membership = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.orgId, task.orgId),
      eq(orgMembers.userId, userId),
      isNull(orgMembers.leftAt),
    ),
    columns: { id: true },
  });
  return membership ? "reader" : null;
}

export async function assertMemberIds(
  db: Db,
  orgId: string,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) {
    return;
  }
  const unique = [...new Set(userIds)];
  const rows = await db.query.orgMembers.findMany({
    where: and(
      eq(orgMembers.orgId, orgId),
      isNull(orgMembers.leftAt),
    ),
    columns: { userId: true },
  });
  const live = new Set(rows.map((row) => row.userId));
  for (const id of unique) {
    if (!live.has(id)) {
      throw new AccessError("NOT_A_MEMBER", "Not a member of this organization");
    }
  }
}

export async function liveOrgMemberUserIds(
  db: Db,
  orgId: string,
): Promise<string[]> {
  const rows = await db.query.orgMembers.findMany({
    where: and(eq(orgMembers.orgId, orgId), isNull(orgMembers.leftAt)),
    columns: { userId: true },
  });
  return rows.map((row) => row.userId);
}
