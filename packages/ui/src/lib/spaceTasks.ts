import { BUCKETS, reorderWithinSubset, type Task } from "@tudu/shared";
import type { CurrentSpace } from "@tudu/store";
import type { ContainerItems } from "@/lib/dragSort";

export function filterTasksForSpace(tasks: Task[], space: CurrentSpace): Task[] {
  if (space.kind === "personal") {
    return tasks;
  }
  return tasks.filter((task) => task.orgId === space.orgId);
}

export function mergeSubsetReorder(
  aggregateTasks: Task[],
  visibleItems: ContainerItems,
  selectedDate: string,
): ContainerItems {
  const merged: ContainerItems = {};
  for (const bucket of BUCKETS) {
    const fullIds = aggregateTasks
      .filter(
        (task) =>
          task.scheduledDate === selectedDate &&
          task.bucket === bucket &&
          !task.completedAt,
      )
      .sort((left, right) => left.position - right.position)
      .map((task) => task.id);
    const visibleNew = visibleItems[bucket] ?? [];
    if (visibleNew.length === 0 || visibleNew.length === fullIds.length) {
      merged[bucket] = visibleNew.length ? visibleNew : fullIds;
      continue;
    }
    try {
      merged[bucket] = reorderWithinSubset(fullIds, visibleNew);
    } catch {
      merged[bucket] = fullIds;
    }
  }
  return merged;
}

export function orgBadgeForTask(
  task: Task,
  space: CurrentSpace,
  orgById: Map<string, { name: string; color: string }>,
): { name: string; color: string } | null {
  if (space.kind !== "personal" || !task.orgId) {
    return null;
  }
  return orgById.get(task.orgId) ?? null;
}
