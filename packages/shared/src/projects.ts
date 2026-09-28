import { z } from "zod";
import { SPACE_COLOR_NAMES, type SpaceColor } from "./colors.js";

export const PROJECT_COLORS = SPACE_COLOR_NAMES;
export type ProjectColor = SpaceColor;

export const projectColorSchema = z.enum(PROJECT_COLORS);

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "A project needs a name")
  .max(80);

export const projectRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: projectColorSchema,
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
  isPrivate: z.boolean().default(false),
  orgId: z.uuid().nullable().optional(),
});

export type ProjectRef = z.infer<typeof projectRefSchema>;

export const projectSchema = projectRefSchema.extend({
  userId: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type Project = z.infer<typeof projectSchema>;

export const createProjectRequestSchema = z.object({
  name: projectNameSchema,
  color: projectColorSchema,
  isPrivate: z.boolean().optional(),
  orgId: z.uuid().nullable().optional(),
});

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = z
  .object({
    name: projectNameSchema,
    color: projectColorSchema,
    archived: z.boolean(),
    isPrivate: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

export function normalizeProjectName(name: string): string {
  return name.trim();
}

export function projectNameKey(name: string): string {
  return normalizeProjectName(name).toLowerCase();
}

export type ProjectSpaceFilter =
  | { kind: "personal" }
  | { kind: "org"; orgId: string };

export function filterProjectsForSpace<T extends { orgId?: string | null }>(
  projects: T[],
  space: ProjectSpaceFilter,
): T[] {
  if (space.kind === "personal") {
    return projects.filter((project) => project.orgId == null);
  }
  return projects.filter((project) => project.orgId === space.orgId);
}

export type EnsureProjectCandidate = {
  name: string;
  archivedAt: unknown;
  deletedAt: unknown;
};

export function pickProjectToEnsure<T extends EnsureProjectCandidate>(
  rows: T[],
  name: string,
): T | undefined {
  const key = projectNameKey(name);
  const live = rows.filter(
    (row) => row.deletedAt == null && projectNameKey(row.name) === key,
  );
  return live.find((row) => row.archivedAt == null) ?? live[0];
}
