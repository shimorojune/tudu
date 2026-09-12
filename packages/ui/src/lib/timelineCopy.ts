import { format, isSameDay, parseISO } from "date-fns";
import type { Bucket, TimelineEvent } from "@tudu/shared";
import { bucketLabel } from "@/lib/buckets";

export type TimelinePart =
  | { kind: "text"; text: string; muted?: boolean; bold?: boolean; accent?: boolean }
  | { kind: "mono"; text: string };

export type TimelineCopyContext = {
  viewerName: string;
  viewerId?: string;
  isToday: boolean;
  selectedDate: string;
};

export type TimelineCopy = {
  timeLabel: string;
  isSystem: boolean;
  parts: TimelinePart[];
};

function formatEventTime(createdAt: string, referenceDate: string): string {
  const eventDate = parseISO(createdAt);
  const reference = new Date(`${referenceDate}T12:00:00`);

  if (isSameDay(eventDate, reference)) {
    return format(eventDate, "HH:mm");
  }

  return format(eventDate, "d MMM");
}

function actorPart(event: TimelineEvent, ctx: TimelineCopyContext): TimelinePart {
  const name = event.actor?.name?.trim() || ctx.viewerName;
  return { kind: "text", text: name, bold: true };
}

function bucketName(bucket: Bucket | null | undefined, ctx: TimelineCopyContext) {
  if (!bucket) {
    return "Unscheduled";
  }
  return bucketLabel(bucket, ctx.isToday);
}

function formatIsoDate(isoDate: string | null): string {
  if (!isoDate) {
    return "none";
  }
  return format(new Date(`${isoDate}T12:00:00`), "EEE d MMM");
}

function formatDeadline(iso: string | null): string {
  if (!iso) {
    return "none";
  }
  return format(parseISO(iso), "EEE d MMM, HH:mm");
}

export function formatTimelineEvent(
  event: TimelineEvent,
  ctx: TimelineCopyContext,
): TimelineCopy {
  const timeLabel = formatEventTime(event.createdAt, ctx.selectedDate);
  const data = event.data;

  switch (event.type) {
    case "created": {
      const actorName = event.actor?.name?.trim();
      const byViewer = !event.actor || event.actor.id === ctx.viewerId;
      return {
        timeLabel,
        isSystem: true,
        parts: [
          {
            kind: "text",
            text: actorName && !byViewer ? `Created by ${actorName}` : "Created by you",
            muted: true,
          },
        ],
      };
    }
    case "renamed":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " renamed this" },
        ],
      };
    case "description_changed":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " updated the description" },
        ],
      };
    case "completed":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " completed this" },
        ],
      };
    case "reopened":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " reopened this" },
        ],
      };
    case "moved": {
      const from = bucketName(data.from as Bucket | null, ctx);
      const to = bucketName(data.to as Bucket | null, ctx);
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " moved this from " },
          { kind: "text", text: from, bold: true },
          { kind: "text", text: " to " },
          { kind: "text", text: to, bold: true, accent: true },
        ],
      };
    }
    case "rescheduled":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " rescheduled this" },
        ],
      };
    case "deadline_changed":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " set the deadline to " },
          {
            kind: "mono",
            text: formatDeadline((data.to as string | null) ?? null),
          },
        ],
      };
    case "start_changed":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " changed the start date to " },
          {
            kind: "mono",
            text: formatIsoDate((data.to as string | null) ?? null),
          },
        ],
      };
    case "privacy_changed":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          {
            kind: "text",
            text: data.toPrivate ? " made this private" : " made this visible",
          },
        ],
      };
    case "commented":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " commented" },
        ],
      };
    case "comment_edited":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " edited a comment" },
        ],
      };
    case "comment_deleted":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " deleted a comment" },
        ],
      };
    case "rolled_over": {
      const from = formatIsoDate((data.from as string | null) ?? null);
      const days = data.carriedDays as number | undefined;
      const suffix =
        days && days > 1
          ? `, ${days} days carried`
          : days === 1
            ? ", first day carried"
            : "";
      return {
        timeLabel,
        isSystem: true,
        parts: [
          {
            kind: "text",
            text: `Rolled over from ${from}${suffix}`,
            muted: true,
          },
        ],
      };
    }
    case "inbox_sent":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " sent this to Inbox" },
        ],
      };
    case "inbox_accepted": {
      const acceptDate =
        typeof data.scheduledDate === "string" ? data.scheduledDate : null;
      const sameDay = !acceptDate || acceptDate === ctx.selectedDate;
      const rawBucket = (data.bucket as Bucket | null) ?? null;
      const bucket = rawBucket
        ? bucketLabel(rawBucket, sameDay && ctx.isToday)
        : "Unscheduled";
      const parts: TimelinePart[] = [
        actorPart(event, ctx),
        { kind: "text", text: " accepted this into " },
        { kind: "text", text: bucket, bold: true, accent: true },
      ];
      if (acceptDate && !sameDay) {
        parts.push({ kind: "text", text: ` on ${formatIsoDate(acceptDate)}` });
      }
      return {
        timeLabel,
        isSystem: false,
        parts,
      };
    }
    case "inbox_declined":
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text: " declined this" },
        ],
      };
    case "project_changed": {
      const to = (data.to as string | null) ?? null;
      const from = (data.from as string | null) ?? null;
      const text = to
        ? from
          ? ` moved this from ${from} to ${to}`
          : ` set the project to ${to}`
        : " cleared the project";
      return {
        timeLabel,
        isSystem: false,
        parts: [
          actorPart(event, ctx),
          { kind: "text", text },
        ],
      };
    }
    default:
      return {
        timeLabel,
        isSystem: true,
        parts: [{ kind: "text", text: "Activity", muted: true }],
      };
  }
}

export function syntheticCreatedEvent(taskId: string, createdAt: string): TimelineEvent {
  return {
    id: `synthetic-created-${taskId}`,
    taskId,
    actorId: null,
    actor: null,
    type: "created",
    data: {},
    createdAt,
  };
}

export function withSyntheticCreated(taskId: string, createdAt: string, events: TimelineEvent[]) {
  if (events.some((event) => event.type === "created" || event.type === "inbox_sent")) {
    return events;
  }
  const synthetic = syntheticCreatedEvent(taskId, createdAt);
  if (events.length === 0) {
    return [synthetic];
  }
  return [...events, synthetic];
}
