import { format, parseISO } from "date-fns";
import type { CSSProperties } from "react";
import type { JiraIssue, JiraTaskLinkSummary } from "@tudu/shared";

export function formatJiraDueDate(date: string | null): string {
  if (!date) {
    return "No due date";
  }
  return format(parseISO(date), "EEE d MMM");
}

export function formatJiraUpdatedAt(value: string): string {
  return format(parseISO(value), "d MMM HH:mm");
}

type JiraStatusCategory = "todo" | "indeterminate" | "done";

type JiraStatusPresentation = {
  backgroundColor: string;
  borderColor: string;
  color: string;
};

const lozengePalette: Record<string, JiraStatusPresentation> = {
  "medium-gray": {
    backgroundColor: "#DFE1E6",
    borderColor: "#DFE1E6",
    color: "#42526E",
  },
  default: {
    backgroundColor: "#DFE1E6",
    borderColor: "#DFE1E6",
    color: "#42526E",
  },
  "blue-gray": {
    backgroundColor: "#DFE1E6",
    borderColor: "#DFE1E6",
    color: "#42526E",
  },
  yellow: {
    backgroundColor: "#FFF0B3",
    borderColor: "#FFF0B3",
    color: "#172B4D",
  },
  inprogress: {
    backgroundColor: "#FFF0B3",
    borderColor: "#FFF0B3",
    color: "#172B4D",
  },
  green: {
    backgroundColor: "#E3FCEF",
    borderColor: "#E3FCEF",
    color: "#006644",
  },
  success: {
    backgroundColor: "#E3FCEF",
    borderColor: "#E3FCEF",
    color: "#006644",
  },
  brown: {
    backgroundColor: "#FFE2BD",
    borderColor: "#FFE2BD",
    color: "#974F0C",
  },
  "warm-red": {
    backgroundColor: "#FFEBE6",
    borderColor: "#FFEBE6",
    color: "#BF2600",
  },
};

function normalizeStatusName(status: string): string {
  return status.trim().toLowerCase();
}

function matchesAny(normalized: string, needles: string[]): boolean {
  return needles.some((needle) => normalized.includes(needle));
}

function fallbackPresentation(
  statusName: string,
  category?: JiraStatusCategory,
): JiraStatusPresentation {
  const normalized = normalizeStatusName(statusName);

  if (
    matchesAny(normalized, [
      "fix verified",
      "feature verified",
      "verified",
    ])
  ) {
    return lozengePalette.green;
  }

  if (matchesAny(normalized, ["resolved"])) {
    return lozengePalette.yellow;
  }

  if (
    category === "done" ||
    matchesAny(normalized, [
      "closed",
      "done",
      "documented",
      "completed action item",
      "closed action item",
      "closed request",
      "patch rejected",
      "feature ready",
    ])
  ) {
    return lozengePalette["medium-gray"];
  }

  if (
    category === "indeterminate" ||
    matchesAny(normalized, ["progress", "review", "qa", "testing"])
  ) {
    return lozengePalette.yellow;
  }

  return lozengePalette.default;
}

export function jiraStatusPresentationFromColorName(
  colorName: string | null | undefined,
  statusName: string,
  category?: JiraStatusCategory,
): JiraStatusPresentation {
  const key = colorName?.trim().toLowerCase();
  if (key && lozengePalette[key]) {
    return lozengePalette[key];
  }
  return fallbackPresentation(statusName, category);
}

export function jiraStatusStyle(
  issue: JiraIssue | JiraTaskLinkSummary,
): CSSProperties {
  const statusName = "status" in issue ? issue.status.name : issue.statusName;
  const colorName = "status" in issue ? issue.status.colorName : null;
  const category = "status" in issue ? issue.status.category : undefined;
  const presentation = jiraStatusPresentationFromColorName(
    colorName,
    statusName,
    category,
  );

  return {
    backgroundColor: presentation.backgroundColor,
    borderColor: presentation.borderColor,
    color: presentation.color,
  };
}

export function jiraStatusClass(_issue: JiraIssue | JiraTaskLinkSummary): string {
  return "border px-[6px] py-px text-[11px]";
}

export function jiraStatusLabel(issue: JiraIssue | JiraTaskLinkSummary): string {
  const status = "status" in issue ? issue.status.name : issue.statusName;
  return status;
}

export function jiraIssueMeta(issue: JiraIssue): string {
  return [
    `Type: ${issue.issueType ?? "Issue"}`,
    `Assignee: ${issue.assignee?.displayName ?? "Unassigned"}`,
    `Due: ${formatJiraDueDate(issue.dueDate)}`,
  ]
    .filter(Boolean)
    .join(" / ");
}

export function jiraComponentLabel(names: string[]): string {
  if (names.length === 0) {
    return "Component: None";
  }
  return `${names.length === 1 ? "Component" : "Components"}: ${names.join(", ")}`;
}
