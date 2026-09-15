import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JiraIssue } from "@tudu/shared";
import type { JiraAdapter } from "../jira/client.js";

const listJiraIssues = vi.hoisted(() => vi.fn());
const listJiraProjectKeys = vi.hoisted(() => vi.fn());
const readJiraRefreshCursor = vi.hoisted(() => vi.fn());
const resetAssignedJiraIssues = vi.hoisted(() => vi.fn());
const updateJiraRefreshCursor = vi.hoisted(() => vi.fn());
const upsertJiraIssue = vi.hoisted(() => vi.fn());

vi.mock("@tudu/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/db")>();
  return {
    ...actual,
    listJiraIssues,
    listJiraProjectKeys,
    readJiraRefreshCursor,
    resetAssignedJiraIssues,
    updateJiraRefreshCursor,
    upsertJiraIssue,
  };
});

const { refreshAssignedJiraIssues } = await import("./jira.js");

function issue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    id: "100493",
    key: "EGS-100493",
    summary: "Investigate login failure",
    description: "Fails on partition one",
    renderedDescription: null,
    status: { id: "1", name: "Open", category: "todo", colorName: null },
    issueType: "Bug",
    priority: "High",
    assignee: null,
    dueDate: "2026-09-15",
    components: [],
    updatedAt: "2026-09-13T11:00:00.000Z",
    browseUrl: "https://jira.example.test/browse/EGS-100493",
    linkedTasks: [],
    editableFields: [],
    ...overrides,
  };
}

describe("refreshAssignedJiraIssues", () => {
  beforeEach(() => {
    listJiraIssues.mockReset();
    listJiraProjectKeys.mockReset();
    readJiraRefreshCursor.mockReset();
    resetAssignedJiraIssues.mockReset();
    updateJiraRefreshCursor.mockReset();
    upsertJiraIssue.mockReset();
  });

  it("removes changed cached issues that no longer match the assigned list", async () => {
    const cursor = new Date("2026-09-13T10:00:00.000Z");
    const changed = issue({
      status: { id: "6", name: "Done", category: "done", colorName: null },
      assignee: null,
    });
    const searchIssues = vi
      .fn()
      .mockResolvedValueOnce({ issues: [], total: 0 })
      .mockResolvedValueOnce({ issues: [changed], total: 1 })
      .mockResolvedValueOnce({ issues: [], total: 0 });
    const adapter = { searchIssues } as Partial<JiraAdapter> as JiraAdapter;

    listJiraProjectKeys.mockResolvedValue(["EGS"]);
    readJiraRefreshCursor.mockResolvedValue(cursor);
    listJiraIssues.mockResolvedValueOnce([issue()]).mockResolvedValueOnce([]);

    const result = await refreshAssignedJiraIssues({} as never, "owner-1", adapter);

    expect(searchIssues).toHaveBeenNthCalledWith(
      1,
      'assignee = currentUser() AND resolution = Unresolved AND project in (EGS) AND updated >= "2026-09-13 10:00" ORDER BY updated DESC',
      { maxResults: 50, startAt: 0 },
    );
    expect(searchIssues).toHaveBeenNthCalledWith(
      2,
      'issuekey in (EGS-100493) AND updated >= "2026-09-13 10:00" ORDER BY updated DESC',
      { maxResults: 1 },
    );
    expect(searchIssues).toHaveBeenNthCalledWith(
      3,
      "issuekey in (EGS-100493) AND assignee = currentUser() AND resolution = Unresolved AND project in (EGS) ORDER BY updated DESC",
      { maxResults: 1 },
    );
    expect(resetAssignedJiraIssues).toHaveBeenCalledWith(
      {} as never,
      "owner-1",
      ["EGS-100493"],
    );
    expect(updateJiraRefreshCursor).toHaveBeenCalledWith(
      {} as never,
      "owner-1",
      "jira",
      new Date("2026-09-13T11:00:00.000Z"),
    );
    expect(result).toEqual({
      issues: [],
      total: 0,
      startAt: 0,
      hasMore: false,
    });
  });
});
