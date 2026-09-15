import { describe, expect, it } from "vitest";
import {
  buildJiraBrowseUrl,
  jiraConnectionStatusSchema,
  jiraConnectRequestSchema,
  jiraIssueSearchQuerySchema,
  jiraIssueSchema,
  jiraJqlPresetCreateRequestSchema,
  jiraJqlPresetSchema,
  jiraJqlPresetUpdateRequestSchema,
  jiraReportQuerySchema,
  jiraProjectKeysRequestSchema,
  jiraTaskLinkSummarySchema,
  jiraUserSchema,
  normalizeJiraBaseUrl,
  parseJiraIssueKeyOrUrl,
  spawnJiraTaskRequestSchema,
} from "./jira.js";

describe("normalizeJiraBaseUrl", () => {
  it("keeps only the origin and pathname without a trailing slash", () => {
    expect(normalizeJiraBaseUrl(" https://beetle.egain.com/jira/ ")).toBe(
      "https://beetle.egain.com/jira",
    );
    expect(normalizeJiraBaseUrl("https://beetle.egain.com/jira/browse/EGS-1")).toBe(
      "https://beetle.egain.com/jira/browse/EGS-1",
    );
  });

  it("rejects non-http urls", () => {
    expect(() => normalizeJiraBaseUrl("file:///tmp/jira")).toThrow(
      "Jira URL must use http or https",
    );
  });
});

describe("parseJiraIssueKeyOrUrl", () => {
  it("accepts an issue key", () => {
    expect(parseJiraIssueKeyOrUrl(" egs-100493 ")).toBe("EGS-100493");
  });

  it("accepts a Jira browse url", () => {
    expect(
      parseJiraIssueKeyOrUrl("https://beetle.egain.com/browse/EGS-100493"),
    ).toBe("EGS-100493");
  });

  it("rejects text without an issue key", () => {
    expect(parseJiraIssueKeyOrUrl("not an issue")).toBeNull();
  });
});

describe("Jira schemas", () => {
  it("does not expose tokens in connection status", () => {
    const status = jiraConnectionStatusSchema.parse({
      connected: true,
      baseUrl: "https://beetle.egain.com",
      displayName: "R Raj",
      email: "rraj@example.com",
      projectKeys: ["EGS"],
      updatedAt: "2026-09-13T10:00:00.000Z",
    });

    expect("token" in status).toBe(false);
    expect(status.projectKeys).toEqual(["EGS"]);
  });

  it("normalizes project keys and rejects unsafe JQL fragments", () => {
    expect(
      jiraConnectRequestSchema.parse({
        baseUrl: "https://beetle.egain.com",
        token: "pat",
        projectKeys: [" egs ", "ENG_2"],
      }).projectKeys,
    ).toEqual(["EGS", "ENG_2"]);

    expect(() =>
      jiraProjectKeysRequestSchema.parse({
        projectKeys: ["EGS) OR assignee IS NOT EMPTY"],
      }),
    ).toThrow(/Expected a Jira project key/);
  });

  it("keeps Jira issue metadata separate from local task titles", () => {
    const issue = jiraIssueSchema.parse({
      id: "100493",
      key: "EGS-100493",
      summary: "Improve archive permission error",
      status: { id: "3", name: "In Progress", category: "indeterminate" },
      issueType: "Bug",
      priority: "High",
      assignee: null,
      dueDate: "2026-09-15",
      components: [{ id: "13", name: "KB" }],
      updatedAt: "2026-09-13T10:00:00.000Z",
      browseUrl: "https://beetle.egain.com/browse/EGS-100493",
      linkedTasks: [
        {
          taskId: "11111111-1111-4111-8111-111111111111",
          title: "Write failing regression",
          isPrivate: false,
        },
        {
          taskId: "22222222-2222-4222-8222-222222222222",
          title: "Patch archive copy",
          isPrivate: false,
        },
      ],
    });

    expect(issue.summary).not.toBe(issue.linkedTasks[0]?.title);
    expect(issue.linkedTasks.map((task) => task.title)).toEqual([
      "Write failing regression",
      "Patch archive copy",
    ]);
  });

  it("supports Jira users for assignee search", () => {
    const user = jiraUserSchema.parse({
      accountId: "rraj",
      name: "rraj",
      displayName: "R Raj",
      emailAddress: "rraj@example.com",
      active: true,
    });

    expect(user.emailAddress).toBe("rraj@example.com");
  });

  it("accepts one or many Component ids on Jira issue search queries", () => {
    expect(jiraIssueSearchQuerySchema.parse({}).componentIds).toEqual([]);
    expect(jiraIssueSearchQuerySchema.parse({ jqlPresetId: "" }).jqlPresetId).toBeNull();
    expect(jiraIssueSearchQuerySchema.parse({ jqlPresetId: "null" }).jqlPresetId).toBeNull();
    expect(
      jiraIssueSearchQuerySchema.parse({
        jql: ' status = "Code Review" ',
      }).jql,
    ).toBe('status = "Code Review"');
    expect(
      jiraIssueSearchQuerySchema.parse({
        jqlPresetId: "11111111-1111-4111-8111-111111111111",
      }).jqlPresetId,
    ).toBe("11111111-1111-4111-8111-111111111111");
    expect(
      jiraIssueSearchQuerySchema.parse({ componentIds: "20001" }).componentIds,
    ).toEqual(["20001"]);
    expect(
      jiraIssueSearchQuerySchema.parse({
        componentIds: ["20001", "20002"],
      }).componentIds,
    ).toEqual(["20001", "20002"]);
    expect(
      jiraReportQuerySchema.parse({
        userId: "priya",
        jqlPresetId: "null",
        componentIds: "20001",
        jql: "issuetype = Bug",
      }),
    ).toMatchObject({ jqlPresetId: null, componentIds: ["20001"], jql: "issuetype = Bug" });
  });

  it("validates personal Jira JQL presets", () => {
    const preset = jiraJqlPresetSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      name: "My bugs",
      jql: "issuetype = Bug AND resolution = Unresolved",
      isDefault: true,
      createdAt: "2026-09-13T10:00:00.000Z",
      updatedAt: "2026-09-13T10:00:00.000Z",
    });

    expect(preset.name).toBe("My bugs");
    expect(preset.isDefault).toBe(true);
    expect(
      jiraJqlPresetCreateRequestSchema.parse({
        name: "Review",
        jql: "status = \"Code Review\"",
        isDefault: false,
      }),
    ).toEqual({
      name: "Review",
      jql: "status = \"Code Review\"",
      isDefault: false,
    });
    expect(
      jiraJqlPresetUpdateRequestSchema.parse({ name: " Mine ", isDefault: true }),
    ).toEqual({ name: "Mine", isDefault: true });
    expect(() => jiraJqlPresetCreateRequestSchema.parse({ name: "", jql: "project = EGS" })).toThrow();
    expect(() => jiraJqlPresetCreateRequestSchema.parse({ name: "Bad", jql: " " })).toThrow();
  });

  it("uses issue metadata as a spawn-task default, not a permanent title link", () => {
    const request = spawnJiraTaskRequestSchema.parse({
      issueId: "100493",
      title: "Write failing regression",
      scheduledDate: null,
      bucket: null,
    });

    expect(request.title).toBe("Write failing regression");
  });

  it("summarizes linked issues for task row metadata", () => {
    const link = jiraTaskLinkSummarySchema.parse({
      issueId: "100493",
      key: "EGS-100493",
      summary: "Improve archive permission error",
      statusName: "In Progress",
      dueDate: "2026-09-15",
      browseUrl: "https://beetle.egain.com/browse/EGS-100493",
    });

    expect(link.key).toBe("EGS-100493");
  });
});

describe("buildJiraBrowseUrl", () => {
  it("builds a browse url from the normalized base", () => {
    expect(buildJiraBrowseUrl("https://beetle.egain.com/jira/", "EGS-100493")).toBe(
      "https://beetle.egain.com/jira/browse/EGS-100493",
    );
  });
});
