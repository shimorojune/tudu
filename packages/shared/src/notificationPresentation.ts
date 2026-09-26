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

export type JiraUpdatedFieldSnapshot = {
  statusName: string | null;
  priorityName: string | null;
  dueAt: Date | null;
  summary: string | null;
  descriptionHash: string | null;
};

const JIRA_SUMMARY_DELTA_MAX = 48;

function formatJiraDueDateLabel(dueAt: Date | null): string {
  if (!dueAt) {
    return "None";
  }
  const year = dueAt.getFullYear();
  const month = String(dueAt.getMonth() + 1).padStart(2, "0");
  const day = String(dueAt.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function jiraFieldDeltaLine(
  label: string,
  prior: string,
  current: string,
): string {
  return `${label}: ${prior} → ${current}`;
}

export function formatJiraUpdatedPresentation(args: {
  title: string;
  prior: JiraUpdatedFieldSnapshot;
  current: JiraUpdatedFieldSnapshot;
}): NotificationPresentation {
  const lines: string[] = [];

  if (args.prior.statusName !== args.current.statusName) {
    lines.push(
      jiraFieldDeltaLine(
        "Status",
        args.prior.statusName ?? "None",
        args.current.statusName ?? "None",
      ),
    );
  }

  if (args.prior.priorityName !== args.current.priorityName) {
    lines.push(
      jiraFieldDeltaLine(
        "Priority",
        args.prior.priorityName ?? "None",
        args.current.priorityName ?? "None",
      ),
    );
  }

  if (
    (args.prior.dueAt?.toISOString() ?? null) !==
    (args.current.dueAt?.toISOString() ?? null)
  ) {
    lines.push(
      jiraFieldDeltaLine(
        "Due date",
        formatJiraDueDateLabel(args.prior.dueAt),
        formatJiraDueDateLabel(args.current.dueAt),
      ),
    );
  }

  if (args.prior.summary !== args.current.summary) {
    const priorSummary = clipNotificationText(
      args.prior.summary ?? "",
      JIRA_SUMMARY_DELTA_MAX,
    );
    const currentSummary = clipNotificationText(
      args.current.summary ?? "",
      JIRA_SUMMARY_DELTA_MAX,
    );
    lines.push(
      jiraFieldDeltaLine(
        "Summary",
        priorSummary || "None",
        currentSummary || "None",
      ),
    );
  }

  if (args.prior.descriptionHash !== args.current.descriptionHash) {
    lines.push("Description updated");
  }

  const summary =
    lines.length === 1 ? lines[0] : lines.length > 1 ? lines.join(", ") : undefined;

  return {
    title: args.title,
    lines,
    summary,
  };
}
