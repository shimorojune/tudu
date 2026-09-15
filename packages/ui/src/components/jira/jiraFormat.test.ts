import { describe, expect, it } from "vitest";
import {
  jiraStatusPresentationFromColorName,
  jiraStatusStyle,
} from "./jiraFormat";

describe("jiraStatusPresentationFromColorName", () => {
  it("maps Jira green colorName to lozenge colors", () => {
    const presentation = jiraStatusPresentationFromColorName(
      "green",
      "Fix Verified",
    );
    expect(presentation.backgroundColor).toBe("#E3FCEF");
    expect(presentation.color).toBe("#006644");
  });

  it("maps Jira yellow colorName to lozenge colors", () => {
    const presentation = jiraStatusPresentationFromColorName(
      "yellow",
      "Resolved",
    );
    expect(presentation.backgroundColor).toBe("#FFF0B3");
  });

  it("maps Jira 9 semantic success to green lozenge colors", () => {
    const presentation = jiraStatusPresentationFromColorName(
      "success",
      "Closed",
      "done",
    );
    expect(presentation.backgroundColor).toBe("#E3FCEF");
  });

  it("falls back to name heuristics when colorName is missing", () => {
    const presentation = jiraStatusPresentationFromColorName(
      null,
      "In Progress",
      "indeterminate",
    );
    expect(presentation.backgroundColor).toBe("#FFF0B3");
  });
});

describe("jiraStatusStyle", () => {
  it("returns inline styles for issue status badges", () => {
    const style = jiraStatusStyle({
      id: "1",
      key: "EGS-1",
      summary: "Issue",
      description: null,
      renderedDescription: null,
      status: {
        id: "3",
        name: "Closed",
        category: "done",
        colorName: "success",
      },
      issueType: null,
      priority: null,
      assignee: null,
      dueDate: null,
      components: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
      browseUrl: "https://example.com/browse/EGS-1",
      linkedTasks: [],
      editableFields: [],
    });

    expect(style.backgroundColor).toBe("#E3FCEF");
    expect(style.color).toBe("#006644");
  });
});
