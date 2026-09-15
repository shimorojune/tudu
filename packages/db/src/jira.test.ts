import { QueryBuilder } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import {
  findReportVisibleJiraIssue,
  jiraIssues,
  jiraJqlPresets,
  jiraProjectKeyFromIssueKey,
  jiraTaskLinks,
  queryAssignedJiraIssuesSql,
  queryJiraJqlPresetsSql,
  queryResetJiraScopeCacheSql,
  queryReplaceJiraComponentsSql,
  queryClearJiraCacheSql,
  queryJiraUserFallbackIndexesSql,
  mapJiraConnectionStatus,
  mapJiraIssue,
  mapJiraTaskLinkSummary,
  publicJiraLinkedTasksOnly,
  queryReportJiraIssuesSql,
  stableJiraUserIdentity,
  shouldShowJiraIssueForProjectKeys,
} from "./jira.js";

const cachedAt = new Date("2026-09-13T10:00:00.000Z");

const issueRow: typeof jiraIssues.$inferSelect = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "user-1",
  issueId: "100493",
  key: "EGS-100493",
  summary: "Improve archive permission error",
  description: "Steps to reproduce",
  statusId: "3",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  issueType: "Bug",
  priority: "High",
  assigneeAccountId: "rraj",
  assigneeName: "R Raj",
  assigneeEmail: "rraj@example.com",
  dueDate: "2026-09-15",
  components: [{ id: "13", name: "KB", projectKey: "EGS" }],
  browseUrl: "https://beetle.egain.com/browse/EGS-100493",
  remoteUpdatedAt: cachedAt,
  cachedAt,
  assignedListAt: null,
  deletedAt: null,
};

describe("mapJiraConnectionStatus", () => {
  it("returns public connection metadata without encrypted token columns", () => {
    const status = mapJiraConnectionStatus(
      {
        userId: "user-1",
        baseUrl: "https://beetle.egain.com",
        encryptedToken: "secret",
        tokenIv: "iv",
        tokenAuthTag: "tag",
        displayName: "R Raj",
        email: "rraj@example.com",
        createdAt: cachedAt,
        updatedAt: cachedAt,
        deletedAt: null,
      },
      ["EGS"],
    );

    expect(status).toEqual({
      connected: true,
      baseUrl: "https://beetle.egain.com",
      displayName: "R Raj",
      email: "rraj@example.com",
      projectKeys: ["EGS"],
      updatedAt: "2026-09-13T10:00:00.000Z",
    });
    expect("encryptedToken" in status).toBe(false);
  });
});

describe("mapJiraIssue", () => {
  it("keeps issue summary separate from linked task titles", () => {
    const issue = mapJiraIssue(issueRow, {
      linkedTasks: [
        {
          taskId: "22222222-2222-4222-8222-222222222222",
          title: "Write failing regression",
          isPrivate: false,
        },
        {
          taskId: "33333333-3333-4333-8333-333333333333",
          title: "Patch archive copy",
          isPrivate: false,
        },
      ],
    });

    expect(issue.summary).toBe("Improve archive permission error");
    expect(issue.linkedTasks.map((task) => task.title)).toEqual([
      "Write failing regression",
      "Patch archive copy",
    ]);
  });
});

describe("mapJiraTaskLinkSummary", () => {
  it("uses Jira issue metadata for task row summaries", () => {
    expect(mapJiraTaskLinkSummary(issueRow)).toEqual({
      issueId: "100493",
      key: "EGS-100493",
      summary: "Improve archive permission error",
      statusName: "In Progress",
      dueDate: "2026-09-15",
      browseUrl: "https://beetle.egain.com/browse/EGS-100493",
    });
  });
});

describe("publicJiraLinkedTasksOnly", () => {
  it("omits private linked tasks from manager Jira rows", () => {
    const visible = publicJiraLinkedTasksOnly([
      {
        taskId: "22222222-2222-4222-8222-222222222222",
        title: "Public task",
        isPrivate: false,
      },
      {
        taskId: "33333333-3333-4333-8333-333333333333",
        title: "Private task",
        isPrivate: true,
      },
    ]);

    expect(visible).toEqual([
      {
        taskId: "22222222-2222-4222-8222-222222222222",
        title: "Public task",
        isPrivate: false,
      },
    ]);
  });
});

describe("jiraProjectKeyFromIssueKey", () => {
  it("extracts the uppercase Jira project key prefix", () => {
    expect(jiraProjectKeyFromIssueKey("egs-100493")).toBe("EGS");
  });
});

describe("shouldShowJiraIssueForProjectKeys", () => {
  it("keeps cached issue lists scoped to configured Jira projects", () => {
    expect(shouldShowJiraIssueForProjectKeys("EGS-100493", ["EGS"])).toBe(true);
    expect(shouldShowJiraIssueForProjectKeys("ABC-7", ["EGS"])).toBe(false);
    expect(shouldShowJiraIssueForProjectKeys("ABC-7", [])).toBe(true);
  });
});

describe("stableJiraUserIdentity", () => {
  it("uses accountId first and stable Data Center fields as fallbacks", () => {
    expect(
      stableJiraUserIdentity({
        accountId: "account-1",
        key: "legacy-key",
        name: "legacy-name",
        displayName: "R Raj",
        emailAddress: "rraj@example.com",
        active: true,
        avatarUrl: null,
      }),
    ).toEqual({ column: "accountId", value: "account-1" });
    expect(
      stableJiraUserIdentity({
        accountId: null,
        key: "legacy-key",
        name: "legacy-name",
        displayName: "R Raj",
        emailAddress: "rraj@example.com",
        active: true,
        avatarUrl: null,
      }),
    ).toEqual({ column: "userKey", value: "legacy-key" });
    expect(
      stableJiraUserIdentity({
        accountId: null,
        key: null,
        name: "legacy-name",
        displayName: "R Raj",
        emailAddress: "rraj@example.com",
        active: true,
        avatarUrl: null,
      }),
    ).toEqual({ column: "name", value: "legacy-name" });
  });
});

function selectResult<T>(result: T[]) {
  const chain: {
    from: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    leftJoin: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    then: Promise<T[]>["then"];
  } = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

describe("findReportVisibleJiraIssue", () => {
  it("allows report-visible linked issues from the report owner's Jira cache", async () => {
    const reportIssueRow = { ...issueRow, userId: "report-1" };
    const db = {
      query: {
        user: {
          findFirst: vi.fn().mockResolvedValue({ email: "report@example.test" }),
        },
        jiraProjects: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      select: vi.fn(),
    };
    db.select
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([{ issue: reportIssueRow }]))
      .mockReturnValueOnce(
        selectResult([
          {
            taskId: "22222222-2222-4222-8222-222222222222",
            title: "Visible follow up",
            isPrivate: false,
          },
        ]),
      );

    const found = await findReportVisibleJiraIssue(
      db as never,
      "manager-1",
      "report-1",
      "EGS-100493",
      { canSeeDay: true, canSeePrivate: false },
    );

    expect(found).toMatchObject({
      id: "100493",
      key: "EGS-100493",
      linkedTasks: [
        {
          taskId: "22222222-2222-4222-8222-222222222222",
          title: "Visible follow up",
          isPrivate: false,
        },
      ],
    });
    expect(db.select).toHaveBeenCalledTimes(3);
  });
});

describe("Jira schema SQL", () => {
  it("can store personal Jira JQL presets scoped by user", () => {
    const qb = new QueryBuilder();
    const { sql } = qb
      .select({ name: jiraJqlPresets.name, jql: jiraJqlPresets.jql })
      .from(jiraJqlPresets)
      .where(eq(jiraJqlPresets.userId, "owner-1"))
      .toSQL();

    expect(sql).toContain("jira_jql_presets");
    expect(sql).toContain("user_id");
    expect(queryJiraJqlPresetsSql()).toContain("jira_jql_presets_user_default_uidx");
  });

  it("can join task links to issue cache for summary loading", () => {
    const qb = new QueryBuilder();
    const { sql } = qb
      .select({ taskId: jiraTaskLinks.taskId, key: jiraIssues.key })
      .from(jiraTaskLinks)
      .innerJoin(jiraIssues, eq(jiraTaskLinks.issueId, jiraIssues.issueId))
      .toSQL();

    expect(sql).toContain("jira_task_links");
    expect(sql).toContain("jira_issues");
  });

  it("can select live Jira links for one task", () => {
    const qb = new QueryBuilder();
    const { sql } = qb
      .select({
        issueId: jiraTaskLinks.issueId,
        issueKey: jiraTaskLinks.issueKey,
      })
      .from(jiraTaskLinks)
      .where(eq(jiraTaskLinks.taskId, "22222222-2222-4222-8222-222222222222"))
      .toSQL();

    expect(sql).toContain("jira_task_links");
    expect(sql).toContain("task_id");
  });

  it("can select cached report Jira issues through manager-visible linked tasks", () => {
    const sql = queryReportJiraIssuesSql();

    expect(sql).toContain("jira_issues");
    expect(sql).toContain("jira_task_links");
    expect(sql).toContain("tasks");
    expect(sql).toContain("is_private = false");
  });

  it("filters the personal Jira list to assigned cache rows", () => {
    const sql = queryAssignedJiraIssuesSql();

    expect(sql).toContain("jira_issues");
    expect(sql).toContain("assigned_list_at is not null");
  });

  it("clears derived Jira caches and cursors without deleting task links", () => {
    const sql = queryClearJiraCacheSql();

    expect(sql).toContain("update jira_issues");
    expect(sql).toContain("update jira_issue_comments");
    expect(sql).toContain("update jira_users");
    expect(sql).toContain("delete from jira_refresh_cursors");
    expect(sql).not.toContain("update jira_task_links");
  });

  it("resets assigned Jira caches and cursors when project scope changes", () => {
    const sql = queryResetJiraScopeCacheSql();

    expect(sql).toContain("update jira_issues");
    expect(sql).toContain("assigned_list_at = null");
    expect(sql).toContain("delete from jira_refresh_cursors");
    expect(sql).not.toContain("update jira_task_links");
  });

  it("tombstones stale Jira Components during a full component refresh", () => {
    const sql = queryReplaceJiraComponentsSql();

    expect(sql).toContain("update jira_components");
    expect(sql).toContain("component_id not in");
    expect(sql).toContain("project_key in");
  });

  it("has partial fallback indexes for legacy Jira users without accountId", () => {
    const sql = queryJiraUserFallbackIndexesSql();

    expect(sql).toContain("jira_users_user_key_uidx");
    expect(sql).toContain("account_id is null");
    expect(sql).toContain("jira_users_user_name_uidx");
    expect(sql).toContain("user_key is null");
  });
});
