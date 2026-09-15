import type { JiraIssue } from "@tudu/shared";
import { describe, expect, it } from "vitest";
import { prependKeyIssueToSearchResults } from "./search.js";

function sampleIssue(id: string, key: string): JiraIssue {
  return {
    id,
    key,
    summary: "Summary",
    description: null,
    renderedDescription: null,
    status: { id: "1", name: "Open", category: "todo" },
    issueType: "Bug",
    priority: "High",
    assignee: null,
    dueDate: null,
    components: [],
    updatedAt: "2026-09-13T11:00:00.000Z",
    browseUrl: `https://jira.example.test/browse/${key}`,
    linkedTasks: [],
    editableFields: [],
  };
}

describe("prependKeyIssueToSearchResults", () => {
  it("puts the key issue first and dedupes by id", () => {
    const keyIssue = sampleIssue("1", "EGS-1");
    const other = sampleIssue("2", "EGS-2");
    const merged = prependKeyIssueToSearchResults(keyIssue, {
      issues: [keyIssue, other],
      total: 2,
      startAt: 0,
      hasMore: false,
    });

    expect(merged.issues.map((item) => item.key)).toEqual(["EGS-1", "EGS-2"]);
    expect(merged.total).toBe(2);
  });

  it("increments total when the key issue was not already in the page", () => {
    const keyIssue = sampleIssue("1", "EGS-1");
    const other = sampleIssue("2", "EGS-2");
    const merged = prependKeyIssueToSearchResults(keyIssue, {
      issues: [other],
      total: 1,
      startAt: 0,
      hasMore: false,
    });

    expect(merged.issues.map((item) => item.key)).toEqual(["EGS-1", "EGS-2"]);
    expect(merged.total).toBe(2);
    expect(merged.hasMore).toBe(true);
  });
});
