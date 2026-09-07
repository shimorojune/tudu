import type { Task } from "@tudu/shared";

/** Count open (not completed) tasks in Now for the soft-cap badge. */
export function openNowCount(tasks: Task[]): number {
  return tasks.filter(
    (task) => task.bucket === "now" && task.completedAt === null,
  ).length;
}
