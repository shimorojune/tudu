export type CommandGroup = "Go" | "Actions";

export type CommandAction =
  | {
      kind: "navigate";
      to: "/" | "/week" | "/inbox" | "/unscheduled" | "/team" | "/settings";
      goToToday?: boolean;
    }
  | { kind: "requestAddTask" }
  | { kind: "jumpToThisWeek" };

export type AppCommand = {
  id: string;
  group: CommandGroup;
  label: string;
  keywords: readonly string[];
  shortcut?: string;
  action: CommandAction;
};

export const APP_COMMANDS: readonly AppCommand[] = [
  {
    id: "go-today",
    group: "Go",
    label: "Go to Today",
    keywords: ["today", "home", "day"],
    action: { kind: "navigate", to: "/", goToToday: true },
  },
  {
    id: "go-week",
    group: "Go",
    label: "Go to Week",
    keywords: ["week", "calendar", "schedule"],
    action: { kind: "navigate", to: "/week" },
  },
  {
    id: "go-inbox",
    group: "Go",
    label: "Go to Inbox",
    keywords: ["inbox", "manager"],
    action: { kind: "navigate", to: "/inbox" },
  },
  {
    id: "go-unscheduled",
    group: "Go",
    label: "Go to Unscheduled",
    keywords: ["unscheduled", "backlog", "undated"],
    action: { kind: "navigate", to: "/unscheduled" },
  },
  {
    id: "go-team",
    group: "Go",
    label: "Go to Team",
    keywords: ["team", "reports", "roster"],
    action: { kind: "navigate", to: "/team" },
  },
  {
    id: "go-settings",
    group: "Go",
    label: "Go to Settings",
    keywords: ["settings", "preferences", "account"],
    action: { kind: "navigate", to: "/settings" },
  },
  {
    id: "new-task",
    group: "Actions",
    label: "New task",
    keywords: ["new", "add", "create", "task"],
    shortcut: "N",
    action: { kind: "requestAddTask" },
  },
  {
    id: "jump-this-week",
    group: "Actions",
    label: "Jump to this week",
    keywords: ["week", "today", "current", "jump"],
    shortcut: "Cmd+Shift+W",
    action: { kind: "jumpToThisWeek" },
  },
] as const;

export function commandsByGroup(): Map<CommandGroup, AppCommand[]> {
  const groups = new Map<CommandGroup, AppCommand[]>();
  for (const command of APP_COMMANDS) {
    const existing = groups.get(command.group) ?? [];
    existing.push(command);
    groups.set(command.group, existing);
  }
  return groups;
}

export function isDesktopApp(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window &&
    window.__TAURI_INTERNALS__ != null
  );
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
