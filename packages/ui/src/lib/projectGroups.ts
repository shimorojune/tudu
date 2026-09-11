import type { Task } from "@tudu/shared";

export type ProjectTaskGroup = {
  id: string;
  label: string;
  tasks: Task[];
};

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function groupProjectTasks(tasks: Task[]): ProjectTaskGroup[] {
  const openByDay = new Map<string, Task[]>();
  const unscheduled: Task[] = [];
  const done: Task[] = [];

  for (const task of tasks) {
    if (task.completedAt) {
      done.push(task);
      continue;
    }
    if (task.scheduledDate === null) {
      unscheduled.push(task);
      continue;
    }
    const list = openByDay.get(task.scheduledDate) ?? [];
    list.push(task);
    openByDay.set(task.scheduledDate, list);
  }

  const groups: ProjectTaskGroup[] = [...openByDay.entries()]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([date, rows]) => ({
      id: date,
      label: dayLabel(date),
      tasks: rows,
    }));

  if (unscheduled.length > 0) {
    groups.push({ id: "unscheduled", label: "Unscheduled", tasks: unscheduled });
  }
  if (done.length > 0) {
    groups.push({ id: "done", label: "Done", tasks: done });
  }

  return groups;
}
