import type { Bucket } from "./tasks.js";

export const TIMELINE_EVENT_TYPES = [
  "created",
  "renamed",
  "description_changed",
  "completed",
  "reopened",
  "moved",
  "rescheduled",
  "deadline_changed",
  "start_changed",
  "privacy_changed",
  "commented",
  "comment_edited",
  "comment_deleted",
  "rolled_over",
  "inbox_sent",
  "inbox_accepted",
  "inbox_declined",
  "project_changed",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export type TimelineEventDraft = {
  type: TimelineEventType;
  data: Record<string, unknown>;
};

export type TaskSnapshot = {
  title: string;
  description: string | null;
  scheduledDate: string | null;
  bucket: Bucket | null;
  startDate: string | null;
  deadline: string | null;
  completedAt: string | null;
  isPrivate: boolean;
  projectName: string | null;
};

/** Compare before and after a task patch. Returns zero or more event drafts.
    Pure: no I/O, fully unit testable. */
export function planTaskTimelineEvents(args: {
  before: TaskSnapshot;
  after: TaskSnapshot;
}): TimelineEventDraft[] {
  const { before, after } = args;
  const events: TimelineEventDraft[] = [];

  if (before.title !== after.title) {
    events.push({
      type: "renamed",
      data: { from: before.title, to: after.title },
    });
  }

  if (before.description !== after.description) {
    events.push({ type: "description_changed", data: {} });
  }

  if (!before.completedAt && after.completedAt) {
    events.push({ type: "completed", data: {} });
  }
  if (before.completedAt && !after.completedAt) {
    events.push({ type: "reopened", data: {} });
  }

  if (
    before.scheduledDate !== after.scheduledDate ||
    before.bucket !== after.bucket
  ) {
    if (
      before.scheduledDate === after.scheduledDate &&
      before.bucket !== after.bucket
    ) {
      events.push({
        type: "moved",
        data: { from: before.bucket, to: after.bucket },
      });
    } else {
      events.push({
        type: "rescheduled",
        data: {
          fromDate: before.scheduledDate,
          fromBucket: before.bucket,
          toDate: after.scheduledDate,
          toBucket: after.bucket,
        },
      });
    }
  }

  if (before.startDate !== after.startDate) {
    events.push({
      type: "start_changed",
      data: { from: before.startDate, to: after.startDate },
    });
  }

  if (before.deadline !== after.deadline) {
    events.push({
      type: "deadline_changed",
      data: { from: before.deadline, to: after.deadline },
    });
  }

  if (before.isPrivate !== after.isPrivate) {
    events.push({
      type: "privacy_changed",
      data: { toPrivate: after.isPrivate },
    });
  }

  if (before.projectName !== after.projectName) {
    events.push({
      type: "project_changed",
      data: { from: before.projectName, to: after.projectName },
    });
  }

  return events;
}
