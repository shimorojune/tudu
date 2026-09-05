import { format, isSameDay, parseISO } from "date-fns";
import type { Task } from "@tudu/shared";

function parseNoon(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`);
}

function formatDeadline(deadline: string, selectedDate: string): string {
  const date = parseISO(deadline);
  const time = format(date, "HH:mm");
  if (isSameDay(date, parseNoon(selectedDate))) {
    return `due today ${time}`;
  }
  return `due ${format(date, "EEE d MMM")}`;
}

function formatStart(startDate: string, selectedDate: string): string | null {
  if (isSameDay(parseNoon(startDate), parseNoon(selectedDate))) {
    return "starts today";
  }
  return `starts ${format(parseNoon(startDate), "d MMM")}`;
}

export type MetaSegment =
  | { kind: "text"; text: string; emphasis?: boolean }
  | { kind: "dot" };

/** Ordered meta segments for the task row meta line. JIRA key is step 10. */
export function taskMetaSegments(
  task: Task,
  selectedDate: string,
): MetaSegment[] {
  const segments: MetaSegment[] = [];

  const start = task.startDate ? formatStart(task.startDate, selectedDate) : null;
  if (start) {
    segments.push({ kind: "text", text: start });
  }

  if (task.deadline) {
    if (segments.length > 0) {
      segments.push({ kind: "dot" });
    }
    const text = formatDeadline(task.deadline, selectedDate);
    const emphasis = text.startsWith("due today");
    segments.push({ kind: "text", text, emphasis });
  }

  const doneCount = task.subtasks.filter((s) => s.done).length;
  if (task.subtasks.length > 0) {
    if (segments.length > 0) {
      segments.push({ kind: "dot" });
    }
    segments.push({
      kind: "text",
      text: `${doneCount} of ${task.subtasks.length}`,
    });
  }

  if (task.carriedDays > 0) {
    if (segments.length > 0) {
      segments.push({ kind: "dot" });
    }
    const dayWord = task.carriedDays === 1 ? "day" : "days";
    segments.push({
      kind: "text",
      text: `carried ${task.carriedDays} ${dayWord}`,
    });
  }

  return segments;
}
