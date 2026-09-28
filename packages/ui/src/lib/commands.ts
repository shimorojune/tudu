export type CommandGroup = "Go" | "Actions";

export type CommandAction =
  | {
      kind: "navigate";
      to:
        | "/"
        | "/week"
        | "/unscheduled"
        | "/settings"
        | "/projects/$projectId";
      goToToday?: boolean;
      search?: Record<string, unknown>;
      params?: { projectId: string };
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
    id: "go-unscheduled",
    group: "Go",
    label: "Go to Unscheduled",
    keywords: ["unscheduled", "backlog", "undated"],
    action: { kind: "navigate", to: "/unscheduled" },
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
  {
    id: "go-settings-projects",
    group: "Go",
    label: "Go to Settings Projects",
    keywords: ["projects", "settings", "group"],
    action: { kind: "navigate", to: "/settings", search: { section: "projects" } },
  },
] as const;

export function projectCommands(
  projects: { id: string; name: string; archivedAt: string | null }[],
): AppCommand[] {
  return projects
    .filter((project) => project.archivedAt === null)
    .flatMap((project) => [
      {
        id: `filter-today-${project.id}`,
        group: "Go" as const,
        label: `Filter Today to ${project.name}`,
        keywords: ["filter", "project", project.name],
        action: {
          kind: "navigate" as const,
          to: "/" as const,
          search: { project: project.id },
        },
      },
      {
        id: `open-project-${project.id}`,
        group: "Go" as const,
        label: `Open project ${project.name}`,
        keywords: ["project", "open", project.name],
        action: {
          kind: "navigate" as const,
          to: "/projects/$projectId" as const,
          params: { projectId: project.id },
        },
      },
    ]);
}

export function buildAppCommands(
  projects: { id: string; name: string; archivedAt: string | null }[],
): AppCommand[] {
  return [...APP_COMMANDS, ...projectCommands(projects)];
}

export function commandsByGroup(
  commands: readonly AppCommand[] = APP_COMMANDS,
): Map<CommandGroup, AppCommand[]> {
  const groups = new Map<CommandGroup, AppCommand[]>();
  for (const command of commands) {
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
