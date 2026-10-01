import { describe, expect, it } from "vitest";
import { APP_COMMANDS, commandsByGroup, projectCommands } from "./commands";

describe("commands", () => {
  it("lists expected command ids and groups", () => {
    expect(APP_COMMANDS.map((command) => command.id)).toEqual([
      "go-today",
      "go-prev-day",
      "go-next-day",
      "go-week",
      "go-unscheduled",
      "go-settings",
      "new-task",
      "jump-this-week",
      "go-settings-projects",
    ]);

    const grouped = commandsByGroup();
    expect(grouped.get("Go")?.map((command) => command.label)).toEqual([
      "Go to Today",
      "Previous day",
      "Next day",
      "Go to Week",
      "Go to Unscheduled",
      "Go to Settings",
      "Go to Settings Projects",
    ]);
    expect(grouped.get("Actions")?.map((command) => command.label)).toEqual([
      "New task",
      "Jump to this week",
    ]);
  });

  it("navigates to settings general from go-settings", () => {
    const command = APP_COMMANDS.find((entry) => entry.id === "go-settings");
    expect(command?.action).toEqual({
      kind: "navigate",
      to: "/settings",
      search: { section: "general" },
    });
  });

  it("adds filter and open commands for live projects", () => {
    const commands = projectCommands([
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "EGS",
        archivedAt: null,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Old",
        archivedAt: "2026-09-01T00:00:00.000Z",
      },
    ]);

    expect(commands.map((command) => command.label)).toEqual([
      "Filter Today to EGS",
      "Open project EGS",
    ]);
  });
});
