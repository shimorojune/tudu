import { format, isSameDay, parseISO } from "date-fns";
import type { Task } from "@tudu/shared";

function parseNoon(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`);
}

function formatDeadline(
  deadline: string,
  selectedDate: string,
  now: Date,
): { text: string; emphasis?: boolean; accent?: boolean } {
  const date = parseISO(deadline);
  const time = format(date, "HH:mm");

  if (date.getTime() < now.getTime()) {
    return { text: `overdue, was due ${time}`, emphasis: true, accent: true };
  }

  if (isSameDay(date, parseNoon(selectedDate))) {
    return { text: `due today ${time}`, emphasis: true };
  }

  return { text: `due ${format(date, "EEE d MMM")}` };
}

function formatStart(startDate: string, selectedDate: string): string | null {
  if (isSameDay(parseNoon(startDate), parseNoon(selectedDate))) {
    return "starts today";
  }
  return `starts ${format(parseNoon(startDate), "d MMM")}`;
}

export type MetaSegment =
  | { kind: "text"; text: string; emphasis?: boolean; accent?: boolean }
  | { kind: "dot" };

/** Ordered meta segments for the task row meta line. JIRA key is step 10. */
export function taskMetaSegments(
  task: Task,
  selectedDate: string,
  now: Date = new Date(),
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
    const deadline = formatDeadline(task.deadline, selectedDate, now);
    segments.push({ kind: "text", ...deadline });
  }

  const doneCount = task.subtasks.filter((s) => s.done).length;
  if (task.subtasks.length > 0) {
    if (segments.length > 0) {
      segments.push({ kind: "dot" });
    }
    segments.push({
      kind: "text",
      text: `${doneCount} of ${task.subtasks.length} completed`,
    });
  }

  return segments;
}
