import { BUCKETS, type Bucket, type Task } from "@tudu/shared";

export const COMPLETED_SECTION_STORAGE_KEY = "tudu.completed-section-open";

export function compareCompletedTasks(a: Task, b: Task): number {
  const aAt = a.completedAt ?? "";
  const bAt = b.completedAt ?? "";
  if (aAt !== bAt) {
    return aAt < bAt ? 1 : -1;
  }
  return a.title.localeCompare(b.title);
}

export function splitOpenAndCompleted(tasks: Task[]): {
  open: Task[];
  completed: Task[];
} {
  const open: Task[] = [];
  const completed: Task[] = [];

  for (const task of tasks) {
    if (task.completedAt !== null) {
      completed.push(task);
    } else {
      open.push(task);
    }
  }

  completed.sort(compareCompletedTasks);
  return { open, completed };
}

export function tasksByBucketOpen(tasks: Task[]): Record<Bucket, Task[]> {
  const grouped = Object.fromEntries(
    BUCKETS.map((bucket) => [bucket, [] as Task[]]),
  ) as Record<Bucket, Task[]>;

  for (const task of tasks) {
    if (task.bucket && task.completedAt === null) {
      grouped[task.bucket].push(task);
    }
  }

  for (const bucket of BUCKETS) {
    grouped[bucket].sort((a, b) => a.position - b.position);
  }

  return grouped;
}

export function openTaskContainer(task: Task): Bucket | null {
  if (task.completedAt !== null) {
    return null;
  }
  return task.bucket;
}

export function readCompletedSectionExpanded(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const raw = window.localStorage.getItem(COMPLETED_SECTION_STORAGE_KEY);
    if (raw === null) {
      return false;
    }
    return raw === "true";
  } catch {
    return false;
  }
}

export function writeCompletedSectionExpanded(expanded: boolean): void {
  window.localStorage.setItem(
    COMPLETED_SECTION_STORAGE_KEY,
    expanded ? "true" : "false",
  );
}
