import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JiraIssue } from "@tudu/shared";

const currentSyncSeq = vi.hoisted(() => vi.fn());
const findLiveLink = vi.hoisted(() => vi.fn());
const listReportJiraIssues = vi.hoisted(() => vi.fn());

vi.mock("@tudu/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/db")>();
  return {
    ...actual,
    currentSyncSeq,
    findLiveLink,
    listReportJiraIssues,
  };
});

const { bootstrapViews } = await import("./applySyncOp.js");

function issue(): JiraIssue {
  return {
    id: "100493",
    key: "EGS-100493",
    summary: "Investigate login failure",
    description: "Fails on partition one",
    renderedDescription: null,
    status: { id: "1", name: "Open", category: "todo" },
    issueType: "Bug",
    priority: "High",
    assignee: {
      accountId: null,
      key: null,
      name: "priya",
      displayName: "Priya Raman",
      emailAddress: "priya@egain.com",
      active: true,
      avatarUrl: null,
    },
    dueDate: "2026-09-15",
    components: [],
    updatedAt: "2026-09-10T08:00:00.000Z",
    browseUrl: "https://jira.example.test/browse/EGS-100493",
    linkedTasks: [],
    editableFields: [],
  };
}

describe("bootstrapViews", () => {
  beforeEach(() => {
    currentSyncSeq.mockResolvedValue(42);
    findLiveLink.mockReset();
    listReportJiraIssues.mockReset();
  });

  it("bootstraps manager report Jira issues as report-scoped events", async () => {
    const permissions = {
      canSeeDay: true,
      canSeePrivate: false,
    };
    const jiraIssue = issue();
    findLiveLink.mockResolvedValue({ permissions });
    listReportJiraIssues.mockResolvedValue([jiraIssue]);

    const result = await bootstrapViews({} as never, "manager-1", [
      "reportJira:report-1",
    ]);

    expect(findLiveLink).toHaveBeenCalledWith({} as never, "manager-1", "report-1");
    expect(listReportJiraIssues).toHaveBeenCalledWith(
      {} as never,
      "manager-1",
      "report-1",
      permissions,
    );
    expect(result).toEqual({
      currentSeq: 42,
      events: [
        {
          seq: 0,
          recipientUserId: "manager-1",
          clientMutationId: null,
          type: "jira.reportIssue.upsert",
          payload: {
            reportUserId: "report-1",
            issue: jiraIssue,
          },
        },
      ],
    });
  });

  it("does not bootstrap report Jira issues without day visibility", async () => {
    findLiveLink.mockResolvedValue({
      permissions: {
        canSeeDay: false,
        canSeePrivate: true,
      },
    });

    const result = await bootstrapViews({} as never, "manager-1", [
      "reportJira:report-1",
    ]);

    expect(listReportJiraIssues).not.toHaveBeenCalled();
    expect(result).toEqual({ currentSeq: 42, events: [] });
  });
});
