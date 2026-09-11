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
import { projects, type ProjectRow } from "./projects-schema.js";

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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapProjectRef(row: ProjectRow | null | undefined): ProjectRef | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    color: row.color,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
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
): Promise<ProjectRow | undefined> {
  return db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.userId, userId),
      isNull(projects.deletedAt),
      isNull(projects.archivedAt),
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
};

export async function createProject(
  db: Db,
  input: CreateProjectInput,
): Promise<ProjectRow> {
  const name = normalizeProjectName(input.name);
  const existing = await db.query.projects.findFirst({
    where: and(
      eq(projects.userId, input.userId),
      isNull(projects.deletedAt),
      sql`lower(${projects.name}) = ${projectNameKey(name)}`,
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
    })
    .returning();

  return rows[0]!;
}

export type UpdateProjectFields = Partial<{
  name: string;
  color: ProjectColor;
  archived: boolean;
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
