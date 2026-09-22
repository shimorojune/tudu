import type { Task } from "@tudu/shared";
import {
  offsetIso,
  type NewTaskDayChoice,
} from "@/components/tasks/TaskScheduleFields";

export function dayChoiceFromTask(
  task: Task,
  today: string,
): { dayChoice: NewTaskDayChoice; pickedDate: string } {
  if (!task.scheduledDate) {
    return { dayChoice: "unscheduled", pickedDate: today };
  }
  if (task.scheduledDate === today) {
    return { dayChoice: "today", pickedDate: today };
  }
  if (task.scheduledDate === offsetIso(today, 1)) {
    return { dayChoice: "tomorrow", pickedDate: task.scheduledDate };
  }
  return { dayChoice: "pick", pickedDate: task.scheduledDate };
}
