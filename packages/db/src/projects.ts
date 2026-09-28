import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  normalizeProjectName,
  pickProjectToEnsure,
  projectNameKey,
  type Project,
  type ProjectColor,
  type ProjectRef,
} from "@tudu/shared";
import type { Db } from "./index.js";
import { requireMemberByOrgId } from "./access.js";
import { projects, type ProjectRow } from "./projects-schema.js";
import { tasks } from "./tasks-schema.js";

export class ProjectError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
    this.name = "ProjectError";
  }
}

export function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    color: row.color,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    isPrivate: row.isPrivate,
    orgId: row.orgId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type MapProjectRefOptions = {
  hidePrivate?: boolean;
};

export function mapProjectRef(
  row: ProjectRow | null | undefined,
  options?: MapProjectRefOptions,
): ProjectRef | null {
  if (!row) {
    return null;
  }

  if (options?.hidePrivate && row.isPrivate) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    color: row.color,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    isPrivate: row.isPrivate,
    orgId: row.orgId ?? null,
  };
}

export function isPublicAssignableProject(
  row:
    | {
        userId: string;
        archivedAt: unknown;
        deletedAt: unknown;
        isPrivate: boolean;
      }
    | null
    | undefined,
  ownerId: string,
): boolean {
  return Boolean(
    row &&
      row.userId === ownerId &&
      row.archivedAt == null &&
      row.deletedAt == null &&
      !row.isPrivate,
  );
}

export async function listProjectsForUser(
  db: Db,
  userId: string,
): Promise<ProjectRow[]> {
  return db.query.projects.findMany({
    where: and(eq(projects.userId, userId), isNull(projects.deletedAt)),
    orderBy: [sql`(${projects.archivedAt} is null) desc`, asc(projects.name)],
  });
}

export async function findProjectById(
  db: Db,
  projectId: string,
): Promise<ProjectRow | undefined> {
  return db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
  });
}

export async function findAssignableProject(
  db: Db,
  userId: string,
  projectId: string,
  options?: { publicOnly?: boolean },
): Promise<ProjectRow | undefined> {
  return db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.userId, userId),
      isNull(projects.deletedAt),
      isNull(projects.archivedAt),
      ...(options?.publicOnly ? [eq(projects.isPrivate, false)] : []),
    ),
  });
}

export async function assertAssignableProject(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectRow> {
  const row = await findAssignableProject(db, userId, projectId);
  if (!row) {
    throw new ProjectError("Project not found", 400);
  }
  return row;
}

export async function assertProjectMatchesTaskOrg(
  db: Db,
  userId: string,
  projectId: string,
  taskOrgId: string | null,
): Promise<ProjectRow> {
  const row = await assertAssignableProject(db, userId, projectId);
  const projectOrgId = row.orgId ?? null;
  if (projectOrgId !== taskOrgId) {
    throw new ProjectError("Project does not belong to this space", 400);
  }
  return row;
}

export async function assertPublicAssignableProject(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectRow> {
  const row = await findAssignableProject(db, userId, projectId, {
    publicOnly: true,
  });
  if (!row || !isPublicAssignableProject(row, userId)) {
    throw new ProjectError("Project not found", 400);
  }
  return row;
}

export async function listPublicProjectsForUser(
  db: Db,
  userId: string,
): Promise<ProjectRow[]> {
  return db.query.projects.findMany({
    where: and(
      eq(projects.userId, userId),
      isNull(projects.deletedAt),
      eq(projects.isPrivate, false),
    ),
    orderBy: [sql`(${projects.archivedAt} is null) desc`, asc(projects.name)],
  });
}

export async function projectNameById(
  db: Db,
  projectId: string | null | undefined,
): Promise<string | null> {
  if (!projectId) {
    return null;
  }

  const row = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { name: true },
  });

  return row?.name ?? null;
}

export type CreateProjectInput = {
  id?: string;
  userId: string;
  name: string;
  color: ProjectColor;
  isPrivate?: boolean;
  orgId?: string | null;
};

export async function createProject(
  db: Db,
  input: CreateProjectInput,
): Promise<ProjectRow> {
  const name = normalizeProjectName(input.name);
  const orgId = input.orgId ?? null;
  if (orgId) {
    await requireMemberByOrgId(db, input.userId, orgId);
  }

  const existing = await db.query.projects.findFirst({
    where: and(
      isNull(projects.deletedAt),
      sql`lower(${projects.name}) = ${projectNameKey(name)}`,
      orgId
        ? eq(projects.orgId, orgId)
        : and(eq(projects.userId, input.userId), isNull(projects.orgId)),
    ),
  });

  if (existing) {
    throw new ProjectError("A project with that name already exists", 400);
  }

  const rows = await db
    .insert(projects)
    .values({
      ...(input.id ? { id: input.id } : {}),
      userId: input.userId,
      name,
      color: input.color,
      isPrivate: orgId ? false : (input.isPrivate ?? false),
      orgId,
    })
    .returning();

  return rows[0]!;
}

export type UpdateProjectFields = Partial<{
  name: string;
  color: ProjectColor;
  archived: boolean;
  isPrivate: boolean;
}>;

export async function updateProject(
  db: Db,
  userId: string,
  projectId: string,
  fields: UpdateProjectFields,
): Promise<ProjectRow | undefined> {
  const existing = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.userId, userId),
      isNull(projects.deletedAt),
    ),
  });

  if (!existing) {
    return undefined;
  }

  if (fields.name !== undefined) {
    const name = normalizeProjectName(fields.name);
    const clash = await db.query.projects.findFirst({
      where: and(
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
        sql`lower(${projects.name}) = ${projectNameKey(name)}`,
        sql`${projects.id} <> ${projectId}`,
      ),
    });
    if (clash) {
      throw new ProjectError("A project with that name already exists", 400);
    }
  }

  const patch: Partial<ProjectRow> = {};
  if (fields.name !== undefined) {
    patch.name = normalizeProjectName(fields.name);
  }
  if (fields.color !== undefined) {
    patch.color = fields.color;
  }
  if (fields.archived === true && !existing.archivedAt) {
    patch.archivedAt = new Date();
  }
  if (fields.archived === false) {
    patch.archivedAt = null;
  }
  if (fields.isPrivate !== undefined) {
    patch.isPrivate = fields.isPrivate;
  }

  if (Object.keys(patch).length === 0) {
    return existing;
  }

  const rows = await db
    .update(projects)
    .set(patch)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning();

  return rows[0];
}

export async function ensureProjectForUser(
  db: Db,
  userId: string,
  input: { name: string; color: ProjectColor },
): Promise<ProjectRow> {
  const name = normalizeProjectName(input.name);
  const rows = await db.query.projects.findMany({
    where: and(eq(projects.userId, userId), isNull(projects.deletedAt)),
  });
  const match = pickProjectToEnsure(rows, name);

  if (match && !match.archivedAt) {
    return match;
  }

  if (match) {
    const updated = await db
      .update(projects)
      .set({ archivedAt: null, color: input.color })
      .where(eq(projects.id, match.id))
      .returning();
    return updated[0]!;
  }

  const created = await db
    .insert(projects)
    .values({
      userId,
      name,
      color: input.color,
    })
    .returning();

  return created[0]!;
}

export async function listLiveTaskIdsForProject(
  db: Db,
  projectId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));
  return rows.map((row) => row.id);
}

export function isProjectEligibleForDelete(row: ProjectRow): boolean {
  return row.deletedAt == null && row.archivedAt != null;
}

export async function deleteProject(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectRow> {
  const existing = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.userId, userId),
      isNull(projects.deletedAt),
    ),
  });

  if (!existing) {
    throw new ProjectError("Project not found", 404);
  }

  if (!isProjectEligibleForDelete(existing)) {
    throw new ProjectError("Archive the project before deleting", 400);
  }

  await db
    .update(tasks)
    .set({ projectId: null })
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));

  const rows = await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning();

  return rows[0];
}
