import { todayIso, type InspectorTab } from "@tudu/store";
import { defaultHighlightDay } from "@/lib/week";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DaySearchTab = "comments" | "timeline";

export type DaySearch = {
  date?: string;
  task?: string;
  tab?: DaySearchTab;
};

export type DaySearchFields = {
  date?: boolean;
  task?: boolean;
  tab?: boolean;
};

export const DAY_TASK_TAB_FIELDS = { date: true, task: true, tab: true } as const;
export const DATE_ONLY_FIELDS = { date: true } as const;
export const TASK_TAB_FIELDS = { task: true, tab: true } as const;

export type DaySearchIssue =
  | "invalidDate"
  | "invalidTask"
  | "invalidTab"
  | "dateNotInWeek";

function isIsoDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function parseDateSearch(
  search: Record<string, unknown>,
): { date?: string } {
  const value = search.date;
  if (typeof value === "string" && isIsoDate(value)) {
    return { date: value };
  }
  return {};
}

export function parseTaskSearch(
  search: Record<string, unknown>,
): { task?: string } {
  const value = search.task;
  if (typeof value === "string" && UUID_RE.test(value)) {
    return { task: value };
  }
  return {};
}

export function parseTabSearch(
  search: Record<string, unknown>,
): { tab?: DaySearchTab } {
  const value = search.tab;
  if (value === "comments" || value === "timeline") {
    return { tab: value };
  }
  return {};
}

export function parseDaySearch(
  search: Record<string, unknown>,
  fields: DaySearchFields,
): DaySearch {
  return {
    ...(fields.date ? parseDateSearch(search) : {}),
    ...(fields.task ? parseTaskSearch(search) : {}),
    ...(fields.tab ? parseTabSearch(search) : {}),
  };
}

export function serializeDaySearch(
  state: {
    date: string;
    taskId: string | null;
    tab: InspectorTab;
  },
  fields: DaySearchFields,
  today: string = todayIso(),
): DaySearch {
  const next: DaySearch = {};
  if (fields.date && state.date !== today) {
    next.date = state.date;
  }
  if (fields.task && state.taskId) {
    next.task = state.taskId;
  }
  if (fields.tab && state.taskId && state.tab !== "details") {
    next.tab = state.tab;
  }
  return next;
}

export function daySearchEqual(left: DaySearch, right: DaySearch): boolean {
  return left.date === right.date && left.task === right.task && left.tab === right.tab;
}

export function mergeDaySearch(
  prev: Record<string, unknown>,
  fields: DaySearchFields,
  next: DaySearch,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...prev };
  if (fields.date) {
    if (next.date) {
      merged.date = next.date;
    } else {
      delete merged.date;
    }
  }
  if (fields.task) {
    if (next.task) {
      merged.task = next.task;
    } else {
      delete merged.task;
    }
  }
  if (fields.tab) {
    if (next.tab) {
      merged.tab = next.tab;
    } else {
      delete merged.tab;
    }
  }
  return merged;
}

export function dayStateFromSearch(args: {
  fields: DaySearchFields;
  parsed: DaySearch;
  today: string;
  weekDays?: readonly string[];
}): {
  date?: string;
  taskId?: string | null;
  inspectorTab?: InspectorTab;
} {
  const result: {
    date?: string;
    taskId?: string | null;
    inspectorTab?: InspectorTab;
  } = {};
  if (args.fields.date) {
    if (args.parsed.date && args.weekDays && !args.weekDays.includes(args.parsed.date)) {
      result.date = defaultHighlightDay(args.weekDays, args.today);
    } else if (args.weekDays && !args.parsed.date) {
      result.date = defaultHighlightDay(args.weekDays, args.today);
    } else {
      result.date = args.parsed.date ?? args.today;
    }
  }
  if (args.fields.task) {
    result.taskId = args.parsed.task ?? null;
  }
  if (args.fields.tab) {
    if (args.parsed.tab) {
      result.inspectorTab = args.parsed.tab;
    } else if (!args.parsed.task) {
      result.inspectorTab = "details";
    }
  }
  return result;
}

export function rawSearchFromString(searchStr: string): Record<string, unknown> {
  const trimmed = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  const raw: Record<string, unknown> = {};
  if (!trimmed) {
    return raw;
  }
  for (const [key, value] of new URLSearchParams(trimmed).entries()) {
    raw[key] = value;
  }
  return raw;
}

export const DAY_SEARCH_TOAST: Record<DaySearchIssue, string> = {
  invalidDate: "That date is not valid. Opened today instead.",
  invalidTask: "Could not open that task.",
  invalidTab: "That view is not valid.",
  dateNotInWeek: "That day is not in this week.",
};

const ISSUE_ORDER: DaySearchIssue[] = [
  "invalidDate",
  "dateNotInWeek",
  "invalidTask",
  "invalidTab",
];

export function firstDaySearchIssue(
  issues: readonly DaySearchIssue[],
): DaySearchIssue | null {
  return ISSUE_ORDER.find((issue) => issues.includes(issue)) ?? null;
}

export type DaySearchPlan =
  | { action: "none" }
  | {
      action: "apply";
      hydrate?: {
        date?: string;
        taskId?: string | null;
        inspectorTab?: InspectorTab;
      };
      write?: DaySearch;
      replace: boolean;
      toast?: DaySearchIssue | "missingTask";
    };

export function planDaySearchSync(input: {
  fields: DaySearchFields;
  parsed: DaySearch;
  redux: { date: string; taskId: string | null; tab: InspectorTab };
  today: string;
  urlChanged: boolean;
  reduxChanged: boolean;
  issues: DaySearchIssue[];
  weekDays?: readonly string[];
  taskFound?: boolean | null;
  clearTask?: boolean;
  silentMissingTask?: boolean;
}): DaySearchPlan {
  const desired = dayStateFromSearch({
    fields: input.fields,
    parsed: input.parsed,
    today: input.today,
    weekDays: input.weekDays,
  });
  if (input.clearTask && input.fields.task) {
    desired.taskId = null;
  }

  const missingTask =
    Boolean(input.fields.task) &&
    input.taskFound === false &&
    Boolean(input.redux.taskId || desired.taskId);

  if (missingTask) {
    const next = {
      date: desired.date ?? input.redux.date,
      taskId: null,
      tab: "details" as InspectorTab,
    };
    return {
      action: "apply",
      hydrate: { taskId: null, inspectorTab: "details" },
      write: serializeDaySearch(next, input.fields, input.today),
      replace: true,
      toast: input.silentMissingTask ? undefined : "missingTask",
    };
  }

  const issue = firstDaySearchIssue(input.issues);
  if (input.urlChanged || issue) {
    const next = {
      date: desired.date ?? input.redux.date,
      taskId: desired.taskId !== undefined ? desired.taskId : input.redux.taskId,
      tab: desired.inspectorTab ?? input.redux.tab,
    };
    const hydrate: {
      date?: string;
      taskId?: string | null;
      inspectorTab?: InspectorTab;
    } = {};
    if (desired.date !== undefined && desired.date !== input.redux.date) {
      hydrate.date = desired.date;
    }
    if (desired.taskId !== undefined && desired.taskId !== input.redux.taskId) {
      hydrate.taskId = desired.taskId;
    }
    if (
      desired.inspectorTab !== undefined &&
      desired.inspectorTab !== input.redux.tab
    ) {
      hydrate.inspectorTab = desired.inspectorTab;
    }
    const write = serializeDaySearch(next, input.fields, input.today);
    const needsWrite = !daySearchEqual(write, input.parsed);
    const hasHydrate = Object.keys(hydrate).length > 0;
    if (!hasHydrate && !needsWrite && !issue) {
      return { action: "none" };
    }
    return {
      action: "apply",
      hydrate: hasHydrate ? hydrate : undefined,
      write: needsWrite ? write : undefined,
      replace: true,
      toast: issue ?? undefined,
    };
  }

  if (!input.reduxChanged) {
    return { action: "none" };
  }

  const write = serializeDaySearch(input.redux, input.fields, input.today);
  if (daySearchEqual(write, input.parsed)) {
    return { action: "none" };
  }
  return {
    action: "apply",
    write,
    replace: write.date === input.parsed.date && write.task === input.parsed.task,
  };
}

export function daySearchToastMessage(
  issue: DaySearchIssue | "missingTask",
): string {
  if (issue === "missingTask") {
    return DAY_SEARCH_TOAST.invalidTask;
  }
  return DAY_SEARCH_TOAST[issue];
}

export function dateLinkSearch<T extends Record<string, unknown> = Record<string, never>>(
  date: string,
  extra?: T,
  today: string = todayIso(),
): T & DaySearch {
  return mergeDaySearch(
    extra ?? {},
    { date: true },
    serializeDaySearch(
      { date, taskId: null, tab: "details" },
      { date: true },
      today,
    ),
  ) as T & DaySearch;
}

export function taskLinkSearch<T extends Record<string, unknown> = Record<string, never>>(args: {
  date: string;
  taskId: string;
  tab?: InspectorTab;
  extra?: T;
  fields?: DaySearchFields;
  today?: string;
}): T & DaySearch {
  const fields = args.fields ?? { date: true, task: true, tab: true };
  return mergeDaySearch(
    args.extra ?? {},
    fields,
    serializeDaySearch(
      {
        date: args.date,
        taskId: args.taskId,
        tab: args.tab ?? "details",
      },
      fields,
      args.today ?? todayIso(),
    ),
  ) as T & DaySearch;
}

function hasRawValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function findDaySearchIssues(
  raw: Record<string, unknown>,
  fields: DaySearchFields,
  options?: { weekDays?: readonly string[] },
): DaySearchIssue[] {
  const issues: DaySearchIssue[] = [];
  if (fields.date && hasRawValue(raw.date) && !parseDateSearch(raw).date) {
    issues.push("invalidDate");
  }
  if (fields.task && hasRawValue(raw.task) && !parseTaskSearch(raw).task) {
    issues.push("invalidTask");
  }
  if (
    fields.tab &&
    hasRawValue(raw.tab) &&
    raw.tab !== "details" &&
    !parseTabSearch(raw).tab
  ) {
    issues.push("invalidTab");
  }
  const date = parseDateSearch(raw).date;
  if (
    fields.date &&
    date &&
    options?.weekDays &&
    !options.weekDays.includes(date)
  ) {
    issues.push("dateNotInWeek");
  }
  return issues;
}
