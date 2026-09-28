import { describe, expect, it } from "vitest";
import {
  SYNC_EVENT_TYPES,
  parseViewKey,
  recipientsForTask,
  syncOpSchema,
  viewKey,
} from "./sync.js";

describe("recipientsForTask", () => {
  it("always includes the owner", () => {
    expect(
      recipientsForTask({
        ownerId: "priya",
        isPrivate: false,
        managerUserId: null,
      }),
    ).toEqual(["priya"]);
  });

  it("adds the manager when the task is not private", () => {
    expect(
      recipientsForTask({
        ownerId: "priya",
        isPrivate: false,
        managerUserId: "marcus",
      }),
    ).toEqual(["priya", "marcus"]);
  });

  it("hides the manager when the task is private", () => {
    expect(
      recipientsForTask({
        ownerId: "priya",
        isPrivate: true,
        managerUserId: "marcus",
      }),
    ).toEqual(["priya"]);
  });
});

describe("viewKey", () => {
  it("round-trips day and maps legacy manager keys to unscheduled", () => {
    expect(parseViewKey(viewKey.day("2026-09-10"))).toEqual({
      type: "day",
      date: "2026-09-10",
    });
    expect(parseViewKey("inbox")).toEqual({ type: "unscheduled" });
    expect(parseViewKey(viewKey.notifications())).toEqual({
      type: "notifications",
    });
    expect(parseViewKey("reportDay:u1:2026-09-10")).toEqual({
      type: "unscheduled",
    });
    expect(parseViewKey(viewKey.projects())).toEqual({ type: "projects" });
    expect(parseViewKey(viewKey.project("11111111-1111-4111-8111-111111111111"))).toEqual({
      type: "project",
      projectId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parseViewKey("reportProjects:u1")).toEqual({ type: "unscheduled" });
    expect(parseViewKey("reportUnscheduled:u1")).toEqual({ type: "unscheduled" });
    expect(parseViewKey("reportInbox:u1")).toEqual({ type: "unscheduled" });
    expect(parseViewKey(viewKey.jira())).toEqual({ type: "jira" });
    expect(parseViewKey(viewKey.jiraComponents())).toEqual({
      type: "jiraComponents",
    });
    expect(parseViewKey(viewKey.jiraUsers())).toEqual({ type: "jiraUsers" });
    expect(parseViewKey(viewKey.jiraIssue("EGS-100493"))).toEqual({
      type: "jiraIssue",
      issueIdOrKey: "EGS-100493",
    });
    expect(parseViewKey(viewKey.requests("personal"))).toEqual({
      type: "requests",
      space: "personal",
    });
    expect(parseViewKey("reportJira:u1")).toEqual({ type: "unscheduled" });
  });
});

describe("Jira sync contracts", () => {
  it("accepts Jira event types", () => {
    expect(SYNC_EVENT_TYPES).toEqual(
      expect.arrayContaining([
      "request.upsert",
      "request.delete",
      "jira.connection",
      "jira.issue.upsert",
      "jira.issue.delete",
      "jira.comment.upsert",
      "jira.link.upsert",
      "jira.link.delete",
      "jira.user.upsert",
      "jira.component.upsert",
      ]),
    );
  });

  it("parses Jira write ops", () => {
    expect(
      syncOpSchema.parse({
      type: "jira.link",
      id: "11111111-1111-4111-8111-111111111111",
      taskId: "22222222-2222-4222-8222-222222222222",
      issueIdOrKey: "EGS-100493",
      }),
    ).toMatchObject({ type: "jira.link", issueIdOrKey: "EGS-100493" });

    expect(
      syncOpSchema.parse({
        type: "jira.issue.updateDueDate",
        issueIdOrKey: "EGS-100493",
        dueDate: "2026-09-15",
      }),
    ).toMatchObject({ type: "jira.issue.updateDueDate" });

    expect(
      syncOpSchema.parse({
        type: "jira.comment.create",
        id: "33333333-3333-4333-8333-333333333333",
        issueIdOrKey: "EGS-100493",
        body: "Added a note from Tudu",
      }),
    ).toMatchObject({ type: "jira.comment.create" });
  });
});
