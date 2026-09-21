import { clipNotificationText } from "./notifications.js";

export type NotificationPresentation = {
  title: string;
  summary?: string;
  lines: string[];
  footnote?: string;
};

export function presentationToBody(presentation: NotificationPresentation): string {
  const parts = [presentation.title];
  if (presentation.summary) {
    parts.push(presentation.summary);
  }
  for (const line of presentation.lines) {
    parts.push(line);
  }
  if (presentation.footnote) {
    parts.push(presentation.footnote);
  }
  return parts.join("\n");
}

export function presentationOsBody(presentation: NotificationPresentation): string {
  if (presentation.summary) {
    return presentation.summary;
  }
  if (presentation.lines.length > 0) {
    return presentation.lines.join("\n");
  }
  return presentation.title;
}

export function parseNotificationPresentation(
  metadata: Record<string, unknown> | null,
  _fallbackBody: string,
): NotificationPresentation | null {
  const raw = metadata?.presentation;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as NotificationPresentation;
  if (!value.title || !Array.isArray(value.lines)) {
    return null;
  }
  return value;
}

export function focusSnapshotHash(taskIds: string[]): string {
  return taskIds.slice().sort().join(",") || "empty";
}

export function formatFocusCheckInPresentation(
  titles: string[],
): NotificationPresentation {
  const clipped = titles
    .map((title) => clipNotificationText(title, 48))
    .filter(Boolean);
  if (clipped.length === 0) {
    return {
      title: "Nothing in progress",
      summary: "Mark what you are working on in Today",
      lines: [],
      footnote: "Tap to open Today",
    };
  }
  if (clipped.length === 1) {
    return {
      title: "In progress",
      lines: [clipped[0]!],
      footnote: "Tap to open this task",
    };
  }
  return {
    title: `${clipped.length} things in progress`,
    lines: clipped.slice(0, 3).map((line, index) => `${index + 1}. ${line}`),
    footnote: clipped.length > 3 ? `and ${clipped.length - 3} more` : "Tap to open Today",
  };
}

export function formatWorkCheckInPresentation(args: {
  inProgress: string[];
  nextUp: string | null;
  slippingCount: number;
  nearestDeadlineHours: number | null;
  nearestDeadlineTitle: string | null;
}): NotificationPresentation {
  const inProgress = args.inProgress
    .map((title) => clipNotificationText(title, 48))
    .filter(Boolean);
  const lines: string[] = [];

  if (inProgress.length === 0) {
    lines.push("Nothing marked in progress on Today");
  } else if (inProgress.length === 1) {
    lines.push(`In progress: ${inProgress[0]!}`);
  } else {
    lines.push(
      `In progress: ${inProgress
        .slice(0, 3)
        .map((t) => clipNotificationText(t, 40))
        .join(", ")}`,
    );
    if (inProgress.length > 3) {
      lines.push(`and ${inProgress.length - 3} more`);
    }
  }

  if (args.nextUp) {
    lines.push(`Next up: ${clipNotificationText(args.nextUp, 48)}`);
  }

  if (args.slippingCount === 1) {
    lines.push("1 task slipping");
  } else if (args.slippingCount > 1) {
    lines.push(`${args.slippingCount} tasks slipping`);
  }

  if (
    args.nearestDeadlineHours !== null &&
    args.nearestDeadlineTitle &&
    args.nearestDeadlineHours > 0
  ) {
    const hours = Math.round(args.nearestDeadlineHours);
    lines.push(
      `Due in ${hours}h: ${clipNotificationText(args.nearestDeadlineTitle, 40)}`,
    );
  }

  if (lines.length === 0) {
    return {
      title: "Work check-in",
      summary: "Open Today to plan your focus",
      lines: [],
      footnote: "Tap to open Today",
    };
  }

  return {
    title: "Work check-in",
    lines,
    footnote: inProgress.length === 1 ? "Tap to open this task" : "Tap to open Today",
  };
}

export function formatDigestPresentation(args: {
  workingOn: string[];
  nextUp: string | null;
}): NotificationPresentation {
  const lines: string[] = [];
  if (args.workingOn.length > 0) {
    lines.push(
      `Working on: ${args.workingOn
        .slice(0, 3)
        .map((t) => clipNotificationText(t, 40))
        .join(", ")}`,
    );
  }
  if (args.nextUp) {
    lines.push(`Next up: ${clipNotificationText(args.nextUp, 48)}`);
  }
  if (lines.length === 0) {
    return {
      title: "Today's focus",
      summary: "No tasks in focus. Check Today or Later.",
      lines: [],
    };
  }
  return {
    title: "Today's focus",
    lines,
  };
}

export function formatDeadlinePresentation(
  hours: number,
  title: string,
): NotificationPresentation {
  return {
    title: `Due in ${hours}h`,
    lines: [clipNotificationText(title, 48)],
    footnote: "Not in progress yet",
  };
}

export function formatLateSlippingPresentation(
  titles: string[],
): NotificationPresentation | null {
  const clipped = titles
    .map((title) => clipNotificationText(title, 48))
    .filter(Boolean);
  if (clipped.length === 0) {
    return null;
  }
  if (clipped.length === 1) {
    return {
      title: "1 task slipping",
      lines: [clipped[0]!],
    };
  }
  const rest = clipped.length - Math.min(3, clipped.length);
  const shown = clipped.slice(0, 3);
  return {
    title: `${clipped.length} tasks slipping`,
    lines: shown,
    summary: rest > 0 ? `and ${rest} more` : undefined,
  };
}
