import { z } from "zod";

export const PROJECT_COLORS = [
  "ember",
  "rust",
  "clay",
  "ink",
  "stone",
  "moss",
] as const;

export const projectColorSchema = z.enum(PROJECT_COLORS);
export type ProjectColor = z.infer<typeof projectColorSchema>;

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
});

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = z
  .object({
    name: projectNameSchema,
    color: projectColorSchema,
    archived: z.boolean(),
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
