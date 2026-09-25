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

export function formatRegularPresentation(args: {
  now: number;
  next: number;
  later: number;
}): NotificationPresentation {
  const total = args.now + args.next + args.later;
  const title =
    total === 1 ? "1 task left today" : `${total} tasks left today`;
  const parts: string[] = [];
  if (args.now > 0) {
    parts.push(`${args.now} Now`);
  }
  if (args.next > 0) {
    parts.push(`${args.next} Next`);
  }
  if (args.later > 0) {
    parts.push(`${args.later} Later`);
  }
  const lines = parts.length > 0 ? [parts.join(", ")] : [];
  return {
    title,
    lines,
    footnote: "Tap to open Today",
  };
}

export function formatAllDonePresentation(): NotificationPresentation {
  return {
    title: "All done for today",
    lines: [],
    footnote: "Tap to open Today",
  };
}

export function clipPresentationTitle(title: string): string {
  return clipNotificationText(title, 48);
}
