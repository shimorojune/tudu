import { describe, expect, it } from "vitest";
import type { JiraIssue } from "@tudu/shared";
import { collectDiffs } from "./jiraNotificationWorker.js";

const target = {
  issueId: "1",
  issueKey: "EGS-1",
  summary: "Fix bug",
  taskIds: ["task-1"],
  taskTitles: ["Fix bug"],
};

const myself = {
  accountId: null,
  name: "dev.user",
  key: "devuser",
  emailAddress: "dev@example.com",
};

const cached: JiraIssue = {
  id: "1",
  key: "EGS-1",
  summary: "Fix bug",
  description: null,
  renderedDescription: null,
  status: { id: "1", name: "Open", category: "todo", colorName: null },
  issueType: "Bug",
  priority: "Major",
  dueDate: null,
  assignee: {
    accountId: null,
    name: "dev.user",
    key: "devuser",
    emailAddress: "dev@example.com",
    displayName: "Dev User",
    active: true,
    avatarUrl: null,
  },
  components: [],
  updatedAt: "2026-09-10T08:00:00.000Z",
  browseUrl: "https://jira.example.com/browse/EGS-1",
  linkedTasks: [],
  editableFields: [],
};

describe("collectDiffs", () => {
  it("does not repeat jira_assigned when assignee matches by name without accountId", () => {
    const pending: { kind: string }[] = [];
    const prior = {
      assignedToMe: true,
      assigneeAccountId: null,
      statusName: "Open",
      priorityName: "Major",
      dueAt: null,
      summary: "Fix bug",
      descriptionHash: "x",
      lastCommentId: null,
    };

    collectDiffs({
      prior: prior as never,
      snapshot: {
        assignedToMe: true,
        statusName: "Open",
        priorityName: "Major",
        dueAt: null,
        summary: "Fix bug",
        descriptionHash: "x",
        lastCommentId: null,
      },
      cached,
      target,
      myself,
      newestComment: null,
      pending: pending as never,
    });

    expect(pending).toHaveLength(0);
  });

  it("skips notifications on first poll when assignedToMe baseline is null", () => {
    const pending: { kind: string }[] = [];
    collectDiffs({
      prior: {
        assignedToMe: null,
        assigneeAccountId: null,
        statusName: "Open",
        priorityName: "Major",
        dueAt: null,
        summary: "Fix bug",
        descriptionHash: "x",
        lastCommentId: null,
      } as never,
      snapshot: {
        assignedToMe: true,
        statusName: "Open",
        priorityName: "Major",
        dueAt: null,
        summary: "Fix bug",
        descriptionHash: "x",
        lastCommentId: null,
      },
      cached,
      target,
      myself,
      newestComment: null,
      pending: pending as never,
    });
    expect(pending).toHaveLength(0);
  });

  it("fires jira_assigned when assignment flips to me", () => {
    const pending: { kind: string }[] = [];
    collectDiffs({
      prior: {
        assignedToMe: false,
        assigneeAccountId: null,
        statusName: "Open",
        priorityName: "Major",
        dueAt: null,
        summary: "Fix bug",
        descriptionHash: "x",
        lastCommentId: null,
      } as never,
      snapshot: {
        assignedToMe: true,
        statusName: "Open",
        priorityName: "Major",
        dueAt: null,
        summary: "Fix bug",
        descriptionHash: "x",
        lastCommentId: null,
      },
      cached,
      target,
      myself,
      newestComment: null,
      pending: pending as never,
    });
    expect(pending.map((row) => row.kind)).toContain("jira_assigned");
  });
});
