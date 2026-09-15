import { describe, expect, it } from "vitest";
import {
  buildAssignedCachedIssuesJql,
  buildAssignedIssuesJql,
  buildChangedCachedIssuesJql,
  buildReportAssignedIssuesJql,
  matchReportJiraUser,
  normalizeJiraIssue,
  normalizeJiraUser,
} from "./client.js";

const resolvedByCurrentUserJql =
  'status in (Resolved, Closed, Documented, "Fix Verified", "Completed Action Item", "Closed Action Item", "Closed Request", Done, "Feature Ready", "Feature Verified", "Patch Rejected") AND "Last Resolved By" in (currentUser()) ORDER BY updated DESC, status ASC';

describe("normalizeJiraUser", () => {
  it("keeps Data Center identity fields and email when present", () => {
    expect(
      normalizeJiraUser({
        accountId: "account-1",
        key: "rraj",
        name: "rraj",
        displayName: "R Raj",
        emailAddress: "rraj@example.com",
        active: true,
        avatarUrls: { "48x48": "https://beetle/avatar.png" },
      }),
    ).toEqual({
      accountId: "account-1",
      key: "rraj",
      name: "rraj",
      displayName: "R Raj",
      emailAddress: "rraj@example.com",
      active: true,
      avatarUrl: "https://beetle/avatar.png",
    });
  });
});

describe("normalizeJiraIssue", () => {
  it("normalizes Data Center issue fields into shared issue metadata", () => {
    const issue = normalizeJiraIssue(
      "https://beetle.egain.com",
      {
        id: "100493",
        key: "EGS-100493",
        fields: {
          summary: "Improve archive permission error",
          description: "Steps to reproduce",
          status: {
            id: "3",
            name: "In Progress",
            statusCategory: { key: "indeterminate", colorName: "yellow" },
          },
          issuetype: { name: "Bug" },
          priority: { name: "High" },
          assignee: {
            name: "rraj",
            displayName: "R Raj",
            emailAddress: "rraj@example.com",
          },
          duedate: "2026-09-15",
          components: [{ id: "13", name: "KB" }],
          updated: "2026-09-13T10:00:00.000+0000",
        },
        renderedFields: {
          description: "<p>Steps to reproduce</p>",
        },
      },
      ["summary", "description", "duedate"],
    );

    expect(issue).toMatchObject({
      id: "100493",
      key: "EGS-100493",
      summary: "Improve archive permission error",
      status: {
        name: "In Progress",
        category: "indeterminate",
        colorName: "yellow",
      },
      issueType: "Bug",
      priority: "High",
      dueDate: "2026-09-15",
      renderedDescription: "<p>Steps to reproduce</p>",
      browseUrl: "https://beetle.egain.com/browse/EGS-100493",
      editableFields: ["summary", "description", "duedate"],
    });
  });
});

describe("buildAssignedIssuesJql", () => {
  it("scopes assigned unresolved issues and optional project keys", () => {
    expect(buildAssignedIssuesJql(["EGS", "KB"], null)).toBe(
      "assignee = currentUser() AND resolution = Unresolved AND project in (EGS,KB) ORDER BY updated DESC",
    );
    expect(buildAssignedIssuesJql(["EGS"], new Date("2026-09-13T10:00:00.000Z"))).toContain(
      'updated >= "2026-09-13 10:00"',
    );
  });

  it("adds text and component filters without dropping assignment scope", () => {
    expect(
      buildAssignedIssuesJql(["EGS"], null, {
        query: "archive bug",
        componentIds: ["20001", "20002"],
      }),
    ).toBe(
      'assignee = currentUser() AND resolution = Unresolved AND project in (EGS) AND text ~ "archive bug" AND component in (20001,20002) ORDER BY updated DESC',
    );
  });

  it("uses personal preset JQL as a full query", () => {
    expect(
      buildAssignedIssuesJql(["EGS"], null, {
        query: "archive bug",
        presetJql: "issuetype = Bug AND status = \"Code Review\"",
      }),
    ).toBe('issuetype = Bug AND status = "Code Review"');
  });

  it("uses typed JQL as a full query without appending scope or ordering", () => {
    expect(
      buildAssignedIssuesJql(["EGS"], null, {
        query: "login",
        presetJql: "issuetype = Bug",
        jql: resolvedByCurrentUserJql,
        componentIds: ["20001"],
      }),
    ).toBe(resolvedByCurrentUserJql);
  });

  it("uses incremental refresh only for unfiltered assigned issue sync", () => {
    expect(
      buildAssignedIssuesJql(["EGS"], new Date("2026-09-13T10:00:00.000Z"), {
        query: "archive bug",
      }),
    ).not.toContain("updated >=");
    expect(
      buildAssignedIssuesJql(["EGS"], new Date("2026-09-13T10:00:00.000Z"), {
        componentIds: ["20001"],
      }),
    ).not.toContain("updated >=");
  });

  it("rejects unsafe project keys before building JQL", () => {
    expect(() => buildAssignedIssuesJql(["EGS) OR assignee IS NOT EMPTY"], null)).toThrow(
      "Expected a Jira project key",
    );
  });
});

describe("buildChangedCachedIssuesJql", () => {
  it("checks cached assigned issues that changed since the last cursor", () => {
    expect(
      buildChangedCachedIssuesJql(
        ["EGS-100493", "KB-7"],
        new Date("2026-09-13T10:00:00.000Z"),
      ),
    ).toBe(
      'issuekey in (EGS-100493,KB-7) AND updated >= "2026-09-13 10:00" ORDER BY updated DESC',
    );
  });

  it("does not build a cache-check query without keys or a cursor", () => {
    expect(buildChangedCachedIssuesJql([], new Date("2026-09-13T10:00:00.000Z"))).toBeNull();
    expect(buildChangedCachedIssuesJql(["EGS-100493"], null)).toBeNull();
  });
});

describe("buildAssignedCachedIssuesJql", () => {
  it("checks whether changed cached issues still belong in the assigned list", () => {
    expect(buildAssignedCachedIssuesJql(["EGS-100493", "KB-7"], ["EGS"])).toBe(
      "issuekey in (EGS-100493,KB-7) AND assignee = currentUser() AND resolution = Unresolved AND project in (EGS) ORDER BY updated DESC",
    );
  });

  it("does not build a membership query without issue keys", () => {
    expect(buildAssignedCachedIssuesJql([], ["EGS"])).toBeNull();
  });
});

describe("buildReportAssignedIssuesJql", () => {
  it("uses the matched Jira user identity for report issue lookup", () => {
    expect(
      buildReportAssignedIssuesJql(
        { name: "priya", key: "PR", accountId: "account-1" },
        ["EGS"],
        {
          query: "login",
          componentIds: ["13"],
          presetJql: "issuetype = Bug",
          jql: resolvedByCurrentUserJql,
        },
      ),
    ).toBe(resolvedByCurrentUserJql);
  });
});

describe("matchReportJiraUser", () => {
  it("matches a report by email or username", () => {
    const users = [
      normalizeJiraUser({
        name: "priya",
        displayName: "Priya Raman",
        emailAddress: "priya@egain.com",
      }),
    ];

    expect(matchReportJiraUser(users, "priya@egain.com")?.name).toBe("priya");
    expect(matchReportJiraUser(users, "priya")?.name).toBe("priya");
    expect(matchReportJiraUser(users, "other@egain.com")).toBeUndefined();
  });
});
