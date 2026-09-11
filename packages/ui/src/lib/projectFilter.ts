import type { Project, ProjectRef, Task } from "@tudu/shared";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseProjectSearch(
  search: Record<string, unknown>,
): { project?: string } {
  const value = search.project;
  if (typeof value === "string" && UUID_RE.test(value)) {
    return { project: value };
  }
  return {};
}

export function isTaskDimmed(
  task: Task,
  projectId: string | null | undefined,
): boolean {
  if (!projectId) {
    return false;
  }
  return task.project?.id !== projectId;
}

export function mergeReportFilterProjects(
  publicProjects: Project[],
  tasks: Task[],
): ProjectRef[] {
  const byId = new Map<string, ProjectRef>();

  for (const project of publicProjects) {
    if (project.isPrivate) {
      continue;
    }
    byId.set(project.id, {
      id: project.id,
      name: project.name,
      color: project.color,
      archivedAt: project.archivedAt,
      isPrivate: project.isPrivate,
    });
  }

  for (const task of tasks) {
    const ref = task.project;
    if (!ref || ref.isPrivate) {
      continue;
    }
    if (!byId.has(ref.id)) {
      byId.set(ref.id, ref);
    }
  }

  return [...byId.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
