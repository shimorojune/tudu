import { describe, expect, it } from "vitest";
import { DEFAULT_MANAGER_PERMISSIONS } from "@tudu/shared";
import {
  canCreateReportJiraComment,
  canWriteReportJiraFields,
  deadlineFromJiraDueDate,
  jiraDueDateFromDeadline,
  taskPatchChangesDeadline,
} from "./applySyncOp.js";

describe("Jira due date conversion", () => {
  it("pushes only the calendar date from a Tudu deadline to Jira", () => {
    expect(jiraDueDateFromDeadline("2026-09-15T18:30:00.000Z")).toBe("2026-09-15");
    expect(jiraDueDateFromDeadline(null)).toBeNull();
  });

  it("maps a Jira due date back to Tudu's deadline timestamp", () => {
    expect(deadlineFromJiraDueDate("2026-09-15")).toEqual(
      new Date("2026-09-15T18:00:00.000Z"),
    );
    expect(deadlineFromJiraDueDate(null)).toBeNull();
  });
});

describe("taskPatchChangesDeadline", () => {
  it("only pushes Jira due date when a task deadline patch changes the date", () => {
    const previous = new Date("2026-09-15T18:00:00.000Z");

    expect(taskPatchChangesDeadline({ title: "Rename" }, previous)).toBe(false);
    expect(
      taskPatchChangesDeadline(
        { deadline: "2026-09-15T18:00:00.000Z" },
        previous,
      ),
    ).toBe(false);
    expect(taskPatchChangesDeadline({ deadline: null }, previous)).toBe(true);
    expect(
      taskPatchChangesDeadline(
        { deadline: "2026-09-16T18:00:00.000Z" },
        previous,
      ),
    ).toBe(true);
  });
});

describe("report Jira write permissions", () => {
  it("separates Jira field edits, due date edits, and comments", () => {
    expect(
      canWriteReportJiraFields(DEFAULT_MANAGER_PERMISSIONS, {
        summary: "Updated",
      }),
    ).toBe(false);
    expect(
      canWriteReportJiraFields(
        { ...DEFAULT_MANAGER_PERMISSIONS, canEditDeadlines: true },
        { dueDate: "2026-09-18" },
      ),
    ).toBe(true);
    expect(
      canWriteReportJiraFields(
        { ...DEFAULT_MANAGER_PERMISSIONS, canEdit: true },
        { summary: "Updated", dueDate: "2026-09-18" },
      ),
    ).toBe(false);
    expect(canCreateReportJiraComment(DEFAULT_MANAGER_PERMISSIONS)).toBe(true);
    expect(
      canCreateReportJiraComment({
        ...DEFAULT_MANAGER_PERMISSIONS,
        canComment: false,
      }),
    ).toBe(false);
  });
});
