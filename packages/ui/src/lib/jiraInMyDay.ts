import type { Bucket, JiraIssue, Task } from "@tudu/shared";
import { todayIso } from "@tudu/store";
import { bucketLabel } from "@/lib/buckets";

export function taskPlacedOnDay(
  task: Task,
  selectedDate: string,
): task is Task & { bucket: Bucket; scheduledDate: string } {
  return (
    task.scheduledDate === selectedDate &&
    task.bucket !== null &&
    task.completedAt === null
  );
}

export function linkedTasksInSelectedDay(
  issue: JiraIssue,
  selectedDate: string,
  tasksById: ReadonlyMap<string, Task>,
): Task[] {
  const placed: Task[] = [];
  for (const link of issue.linkedTasks) {
    const task = tasksById.get(link.taskId);
    if (task && taskPlacedOnDay(task, selectedDate)) {
      placed.push(task);
    }
  }
  return placed;
}

export function issueTetheredOnDay(
  issue: JiraIssue,
  selectedDate: string,
  tasksById: ReadonlyMap<string, Task>,
): boolean {
  return linkedTasksInSelectedDay(issue, selectedDate, tasksById).length > 0;
}

export function formatInMyDayPlacement(
  task: Task,
  selectedDate: string,
  today: string = todayIso(),
): string {
  const bucket = task.bucket;
  if (!bucket || task.scheduledDate !== selectedDate) {
    return "";
  }
  const bucketPart = bucketLabel(bucket, selectedDate === today);
  const done = task.subtasks.filter((subtask) => subtask.done).length;
  const total = task.subtasks.length;
  if (total > 0) {
    return `in my day · ${bucketPart}, ${done} of ${total} done`;
  }
  return `in my day · ${bucketPart}`;
}
