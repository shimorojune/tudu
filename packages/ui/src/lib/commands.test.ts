import { describe, expect, it } from "vitest";
import { APP_COMMANDS, commandsByGroup } from "./commands";

describe("commands", () => {
  it("lists expected command ids and groups", () => {
    expect(APP_COMMANDS.map((command) => command.id)).toEqual([
      "go-today",
      "go-week",
      "go-inbox",
      "go-unscheduled",
      "go-team",
      "go-settings",
      "new-task",
      "jump-this-week",
    ]);

    const grouped = commandsByGroup();
    expect(grouped.get("Go")?.map((command) => command.label)).toEqual([
      "Go to Today",
      "Go to Week",
      "Go to Inbox",
      "Go to Unscheduled",
      "Go to Team",
      "Go to Settings",
    ]);
    expect(grouped.get("Actions")?.map((command) => command.label)).toEqual([
      "New task",
      "Jump to this week",
    ]);
  });
});
