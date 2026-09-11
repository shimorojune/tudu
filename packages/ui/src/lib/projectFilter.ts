import type { Task } from "@tudu/shared";

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
