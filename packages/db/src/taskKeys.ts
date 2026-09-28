import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  DEFAULT_PERSONAL_KEY_PREFIX,
  deriveKeyPrefixFromName,
  formatTaskKey,
  KEY_PREFIX_MAX,
  KEY_PREFIX_MIN,
  type KeyPrefix,
  parseTaskKey,
} from "@tudu/shared";
import type { Db } from "./index.js";
import { orgs } from "./orgs-schema.js";
import {
  spaceKeyCounters,
  spaceKeyPrefixHistory,
  userSpaceSettings,
} from "./task-keys-schema.js";
import { tasks } from "./tasks-schema.js";

export class TaskKeyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TaskKeyError";
  }
}

export async function getPersonalSpaceSettings(
  db: Db,
  userId: string,
): Promise<{ personalKeyPrefix: string; prefixLocked: boolean }> {
  const prefix = await ensureUserSpaceSettings(db, userId);
  const taskCount = await countTasksInScope(db, userId, null);
  return { personalKeyPrefix: prefix, prefixLocked: taskCount > 0 };
}

export async function ensureUserSpaceSettings(
  db: Db,
  userId: string,
): Promise<string> {
  const existing = await db.query.userSpaceSettings.findFirst({
    where: eq(userSpaceSettings.userId, userId),
  });
  if (existing) {
    return existing.personalKeyPrefix;
  }

  const [row] = await db
    .insert(userSpaceSettings)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (row) {
    return row.personalKeyPrefix;
  }

  const again = await db.query.userSpaceSettings.findFirst({
    where: eq(userSpaceSettings.userId, userId),
  });
  return again?.personalKeyPrefix ?? DEFAULT_PERSONAL_KEY_PREFIX;
}

export async function resolveKeyPrefixForScope(
  db: Db,
  userId: string,
  orgId: string | null,
): Promise<string> {
  if (orgId) {
    const org = await db.query.orgs.findFirst({
      where: eq(orgs.id, orgId),
      columns: { keyPrefix: true },
    });
    if (!org) {
      throw new TaskKeyError("ORG_NOT_FOUND", "Organization not found", 404);
    }
    return org.keyPrefix;
  }
  return ensureUserSpaceSettings(db, userId);
}

export async function allocateNextTaskNumber(
  db: Db,
  userId: string,
  orgId: string | null,
): Promise<number> {
  const orgFilter =
    orgId === null ? isNull(spaceKeyCounters.orgId) : eq(spaceKeyCounters.orgId, orgId);

  const updated = await db
    .update(spaceKeyCounters)
    .set({
      nextNumber: sql`${spaceKeyCounters.nextNumber} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(spaceKeyCounters.userId, userId), orgFilter))
    .returning({ nextNumber: spaceKeyCounters.nextNumber });

  if (updated[0]) {
    return updated[0].nextNumber - 1;
  }

  const inserted = await db
    .insert(spaceKeyCounters)
    .values({
      userId,
      orgId,
      nextNumber: 2,
    })
    .returning({ nextNumber: spaceKeyCounters.nextNumber });

  if (inserted[0]) {
    return 1;
  }

  const retry = await db
    .update(spaceKeyCounters)
    .set({
      nextNumber: sql`${spaceKeyCounters.nextNumber} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(spaceKeyCounters.userId, userId), orgFilter))
    .returning({ nextNumber: spaceKeyCounters.nextNumber });

  const row = retry[0];
  if (!row) {
    throw new Error("Failed to allocate task number");
  }
  return row.nextNumber - 1;
}

export async function countTasksInScope(
  db: Db,
  userId: string,
  orgId: string | null,
): Promise<number> {
  const scopeFilter =
    orgId === null
      ? and(eq(tasks.userId, userId), isNull(tasks.orgId))
      : eq(tasks.orgId, orgId);

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(scopeFilter);
  return rows[0]?.count ?? 0;
}

async function isPrefixTaken(db: Db, prefix: string, exclude?: {
  userId?: string;
  orgId?: string;
}): Promise<boolean> {
  const orgHit = await db.query.orgs.findFirst({
    where: eq(orgs.keyPrefix, prefix),
    columns: { id: true },
  });
  if (orgHit && orgHit.id !== exclude?.orgId) {
    return true;
  }

  const personalHit = await db.query.userSpaceSettings.findFirst({
    where: eq(userSpaceSettings.personalKeyPrefix, prefix),
    columns: { userId: true },
  });
  if (personalHit && personalHit.userId !== exclude?.userId) {
    return true;
  }

  const historyHit = await db.query.spaceKeyPrefixHistory.findFirst({
    where: eq(spaceKeyPrefixHistory.prefix, prefix),
    columns: { id: true },
  });
  return Boolean(historyHit);
}

export async function allocateUniqueOrgKeyPrefix(
  db: Db,
  name: string,
): Promise<string> {
  let candidate = deriveKeyPrefixFromName(name);
  if (!(await isPrefixTaken(db, candidate))) {
    return candidate;
  }

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const base = candidate.slice(0, Math.max(KEY_PREFIX_MIN, candidate.length - 1));
    const next = `${base}${suffix}`.slice(0, KEY_PREFIX_MAX);
    if (next.length < KEY_PREFIX_MIN) {
      continue;
    }
    if (!(await isPrefixTaken(db, next))) {
      return next;
    }
  }

  throw new Error("Could not allocate a unique key prefix");
}

export async function setPersonalKeyPrefix(
  db: Db,
  userId: string,
  prefix: KeyPrefix,
): Promise<string> {
  await ensureUserSpaceSettings(db, userId);
  const taskCount = await countTasksInScope(db, userId, null);
  if (taskCount > 0) {
    throw new TaskKeyError(
      "PREFIX_LOCKED",
      "Task prefix is locked after the first task is created",
      422,
    );
  }
  if (await isPrefixTaken(db, prefix, { userId })) {
    throw new TaskKeyError("PREFIX_TAKEN", "That prefix is already in use", 409);
  }

  const current = await db.query.userSpaceSettings.findFirst({
    where: eq(userSpaceSettings.userId, userId),
  });
  if (current && current.personalKeyPrefix !== prefix) {
    await db.insert(spaceKeyPrefixHistory).values({
      userId,
      prefix: current.personalKeyPrefix,
    });
  }

  const [row] = await db
    .update(userSpaceSettings)
    .set({ personalKeyPrefix: prefix, updatedAt: new Date() })
    .where(eq(userSpaceSettings.userId, userId))
    .returning();

  return row?.personalKeyPrefix ?? prefix;
}

export async function setOrgKeyPrefix(
  db: Db,
  userId: string,
  orgSlug: string,
  prefix: KeyPrefix,
): Promise<string> {
  const { requireOwner } = await import("./access.js");
  let liveOrg;
  try {
    liveOrg = await requireOwner(db, userId, orgSlug);
  } catch {
    throw new TaskKeyError("ORG_NOT_FOUND", "Organization not found", 404);
  }
  const live = liveOrg.org;

  const taskCount = await countTasksInScope(db, userId, live.id);
  if (taskCount > 0) {
    throw new TaskKeyError(
      "PREFIX_LOCKED",
      "Task prefix is locked after the first task is created",
      422,
    );
  }
  if (await isPrefixTaken(db, prefix, { orgId: live.id })) {
    throw new TaskKeyError("PREFIX_TAKEN", "That prefix is already in use", 409);
  }

  if (live.keyPrefix !== prefix) {
    await db.insert(spaceKeyPrefixHistory).values({
      orgId: live.id,
      prefix: live.keyPrefix,
    });
  }

  const [row] = await db
    .update(orgs)
    .set({ keyPrefix: prefix, updatedAt: new Date() })
    .where(eq(orgs.id, live.id))
    .returning();

  return row?.keyPrefix ?? prefix;
}

export type TaskKeyScope =
  | { kind: "personal"; userId: string; prefix: string }
  | { kind: "org"; orgId: string; prefix: string };

export async function resolveScopeForPrefix(
  db: Db,
  prefix: string,
): Promise<TaskKeyScope | null> {
  const org = await db.query.orgs.findFirst({
    where: eq(orgs.keyPrefix, prefix),
    columns: { id: true, keyPrefix: true },
  });
  if (org) {
    return { kind: "org", orgId: org.id, prefix: org.keyPrefix };
  }

  const personal = await db.query.userSpaceSettings.findFirst({
    where: eq(userSpaceSettings.personalKeyPrefix, prefix),
    columns: { userId: true, personalKeyPrefix: true },
  });
  if (personal) {
    return {
      kind: "personal",
      userId: personal.userId,
      prefix: personal.personalKeyPrefix,
    };
  }

  const historyOrg = await db.query.spaceKeyPrefixHistory.findFirst({
    where: eq(spaceKeyPrefixHistory.prefix, prefix),
    orderBy: [asc(spaceKeyPrefixHistory.createdAt)],
    columns: { orgId: true, userId: true },
  });
  if (historyOrg?.orgId) {
    return { kind: "org", orgId: historyOrg.orgId, prefix };
  }
  if (historyOrg?.userId) {
    return { kind: "personal", userId: historyOrg.userId, prefix };
  }

  return null;
}

export async function findTaskByKey(
  db: Db,
  viewerId: string,
  rawKey: string,
): Promise<{ taskId: string; taskKey: string } | null> {
  const parsed = parseTaskKey(rawKey);
  if (!parsed) {
    return null;
  }

  const scope = await resolveScopeForPrefix(db, parsed.prefix);
  if (!scope) {
    return null;
  }

  const scopeFilter =
    scope.kind === "org"
      ? eq(tasks.orgId, scope.orgId)
      : and(eq(tasks.userId, scope.userId), isNull(tasks.orgId));

  const row = await db.query.tasks.findFirst({
    where: and(scopeFilter, eq(tasks.taskNumber, parsed.taskNumber)),
    columns: { id: true, userId: true, orgId: true, isPrivate: true },
  });
  if (!row) {
    return null;
  }

  const { resolveTaskAccess } = await import("./access.js");
  const access = await resolveTaskAccess(db, viewerId, row.id);
  if (!access) {
    return null;
  }

  const displayPrefix = await resolveKeyPrefixForScope(
    db,
    row.userId,
    row.orgId,
  );
  return {
    taskId: row.id,
    taskKey: formatTaskKey(displayPrefix, parsed.taskNumber),
  };
}

export async function keyPrefixesForTasks(
  db: Db,
  rows: { userId: string; orgId: string | null }[],
): Promise<Map<string, string>> {
  const orgIds = [...new Set(rows.map((row) => row.orgId).filter(Boolean))] as string[];
  const userIds = [...new Set(rows.filter((row) => !row.orgId).map((row) => row.userId))];

  const orgPrefixes = new Map<string, string>();
  if (orgIds.length > 0) {
    const orgRows = await db
      .select({ id: orgs.id, keyPrefix: orgs.keyPrefix })
      .from(orgs)
      .where(inArray(orgs.id, orgIds));
    for (const org of orgRows) {
      orgPrefixes.set(org.id, org.keyPrefix);
    }
  }

  const personalPrefixes = new Map<string, string>();
  if (userIds.length > 0) {
    const settings = await db
      .select({
        userId: userSpaceSettings.userId,
        personalKeyPrefix: userSpaceSettings.personalKeyPrefix,
      })
      .from(userSpaceSettings)
      .where(inArray(userSpaceSettings.userId, userIds));
    for (const setting of settings) {
      personalPrefixes.set(setting.userId, setting.personalKeyPrefix);
    }
    for (const userId of userIds) {
      if (!personalPrefixes.has(userId)) {
        personalPrefixes.set(userId, DEFAULT_PERSONAL_KEY_PREFIX);
      }
    }
  }

  const result = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.userId}:${row.orgId ?? "personal"}`;
    if (row.orgId) {
      result.set(key, orgPrefixes.get(row.orgId) ?? DEFAULT_PERSONAL_KEY_PREFIX);
    } else {
      result.set(key, personalPrefixes.get(row.userId) ?? DEFAULT_PERSONAL_KEY_PREFIX);
    }
  }
  return result;
}

export function scopeKey(userId: string, orgId: string | null): string {
  return `${userId}:${orgId ?? "personal"}`;
}
