import type { JiraIssue } from "@tudu/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { JiraAdapter } from "../jira/client.js";
import { JiraHttpError } from "../jira/client.js";
import {
  cachedJiraIssueAfterUpsert,
  createJiraRoute,
  ensureConfiguredJiraProjectKey,
  jiraRouteError,
  requireReportVisibleJiraIssue,
  shouldAdvanceJiraRefreshCursor,
} from "./jira.js";
import type { SessionEnv } from "../session-middleware.js";
import { syncRouteError } from "./sync.js";

const upsertJiraIssue = vi.hoisted(() => vi.fn());
const findCachedJiraIssue = vi.hoisted(() => vi.fn());
const findLiveLink = vi.hoisted(() => vi.fn());
const findReportVisibleJiraIssue = vi.hoisted(() => vi.fn());
const getJiraConnection = vi.hoisted(() => vi.fn());
const listJiraJqlPresets = vi.hoisted(() => vi.fn());
const listJiraProjectKeys = vi.hoisted(() => vi.fn());
const listJiraIssues = vi.hoisted(() => vi.fn());
const createJiraJqlPreset = vi.hoisted(() => vi.fn());
const updateJiraJqlPreset = vi.hoisted(() => vi.fn());
const deleteJiraJqlPreset = vi.hoisted(() => vi.fn());
const findJiraJqlPreset = vi.hoisted(() => vi.fn());
const upsertJiraUsers = vi.hoisted(() => vi.fn());
const managerVisibleJiraLinkedTasks = vi.hoisted(() => vi.fn());

vi.mock("@tudu/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/db")>();
  return {
    ...actual,
    findCachedJiraIssue,
    findJiraJqlPreset,
    findLiveLink,
    findReportVisibleJiraIssue,
    getJiraConnection,
    listJiraJqlPresets,
    listJiraProjectKeys,
    listJiraIssues,
    createJiraJqlPreset,
    updateJiraJqlPreset,
    deleteJiraJqlPreset,
    upsertJiraIssue,
    upsertJiraUsers,
    managerVisibleJiraLinkedTasks,
  };
});

vi.mock("../jira/crypto.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../jira/crypto.js")>();
  return {
    ...actual,
    decryptJiraToken: () => "pat",
  };
});

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

function connectedApp(adapter: Partial<JiraAdapter>, db: unknown = fakeDb()) {
  getJiraConnection.mockResolvedValue({
    baseUrl: "https://jira.example.test",
    encryptedToken: "token",
    tokenIv: "iv",
    tokenAuthTag: "tag",
  });
  const adapterFactory = vi.fn(() => adapter as JiraAdapter);
  const app = new Hono<SessionEnv>();
  app.use("*", async (c, next) => {
    c.set("session", {
      user: { id: "manager-1", email: "manager@example.test", name: "Manager" },
    } as never);
    await next();
  });
  app.route("/", createJiraRoute(db as never, { adapterFactory }));
  return app;
}

function fakeDb(email = "priya@egain.com") {
  return {
    query: {
      user: {
        findFirst: async () => ({ email }),
      },
    },
  };
}

function appWithSession(adapterFactory = vi.fn(() => ({} as JiraAdapter))) {
  const app = new Hono<SessionEnv>();
  app.use("*", async (c, next) => {
    c.set("session", {
      user: { id: "manager-1", email: "manager@example.test", name: "Manager" },
    } as never);
    await next();
  });
  app.route("/", createJiraRoute({} as never, { adapterFactory }));
  return app;
}

beforeEach(() => {
  findCachedJiraIssue.mockReset();
  findJiraJqlPreset.mockReset();
  findLiveLink.mockReset();
  findReportVisibleJiraIssue.mockReset();
  getJiraConnection.mockReset();
  listJiraJqlPresets.mockReset();
  listJiraProjectKeys.mockReset();
  listJiraIssues.mockReset();
  createJiraJqlPreset.mockReset();
  updateJiraJqlPreset.mockReset();
  deleteJiraJqlPreset.mockReset();
  upsertJiraIssue.mockReset();
  upsertJiraUsers.mockReset();
  managerVisibleJiraLinkedTasks.mockReset();
  listJiraIssues.mockResolvedValue([]);
  listJiraJqlPresets.mockResolvedValue([]);
  upsertJiraUsers.mockResolvedValue(undefined);
  managerVisibleJiraLinkedTasks.mockResolvedValue([]);
  upsertJiraIssue.mockImplementation(async (_db: unknown, _userId: string, row: JiraIssue) => ({
    issueId: row.id,
  }));
});

describe("shouldAdvanceJiraRefreshCursor", () => {
  it("only advances for unfiltered assigned issue refreshes", () => {
    expect(shouldAdvanceJiraRefreshCursor({})).toBe(true);
    expect(shouldAdvanceJiraRefreshCursor({ query: "" })).toBe(true);
    expect(shouldAdvanceJiraRefreshCursor({ query: "archive bug" })).toBe(false);
    expect(shouldAdvanceJiraRefreshCursor({ componentIds: ["10001"] })).toBe(false);
    expect(shouldAdvanceJiraRefreshCursor({ presetJql: "issuetype = Bug" })).toBe(false);
  });
});

describe("jiraRouteError", () => {
  it("maps setup and remote Jira failures to explicit response statuses", () => {
    expect(jiraRouteError(new Error("Jira URL must be a valid URL"))).toEqual({
      status: 400,
      message: "Jira URL must be a valid URL",
    });
    expect(jiraRouteError(new Error("JIRA_TOKEN_ENCRYPTION_KEY must be 32 bytes"))).toEqual({
      status: 400,
      message: "JIRA_TOKEN_ENCRYPTION_KEY must be 32 bytes",
    });
    expect(jiraRouteError(new JiraHttpError("Jira request failed with 401", 401))).toEqual({
      status: 401,
      message: "Jira request failed with 401",
    });
    expect(jiraRouteError(new JiraHttpError("Jira request failed with 500", 500))).toEqual({
      status: 502,
      message: "Jira request failed with 500",
    });
  });
});

describe("cachedJiraIssueAfterUpsert", () => {
  it("returns the cached issue with linked tasks after storing remote Jira detail", async () => {
    const remoteIssue = issue();
    const cachedIssue = issue({
      linkedTasks: [
        {
          taskId: "11111111-1111-4111-8111-111111111111",
          title: "Local follow up",
          isPrivate: false,
        },
      ],
    });
    upsertJiraIssue.mockResolvedValue({});
    findCachedJiraIssue.mockResolvedValue(cachedIssue);

    await expect(
      cachedJiraIssueAfterUpsert({} as never, "owner-1", remoteIssue),
    ).resolves.toBe(cachedIssue);

    expect(upsertJiraIssue).toHaveBeenCalledWith(
      {} as never,
      "owner-1",
      remoteIssue,
    );
    expect(findCachedJiraIssue).toHaveBeenCalledWith(
      {} as never,
      "owner-1",
      "100493",
    );
  });

  it("falls back to the remote issue if the cache cannot hydrate it", async () => {
    const remoteIssue = issue();
    upsertJiraIssue.mockResolvedValue({});
    findCachedJiraIssue.mockResolvedValue(undefined);

    await expect(
      cachedJiraIssueAfterUpsert({} as never, "owner-1", remoteIssue),
    ).resolves.toBe(remoteIssue);
  });
});

describe("ensureConfiguredJiraProjectKey", () => {
  it("rejects projects outside the configured Jira scope", async () => {
    listJiraProjectKeys.mockResolvedValue(["EGS"]);

    await expect(
      ensureConfiguredJiraProjectKey({} as never, "owner-1", "ABC"),
    ).rejects.toMatchObject({
      message: "Jira project is not configured",
      status: 400,
    });
  });

  it("allows any valid project when no Jira project scope is configured", async () => {
    listJiraProjectKeys.mockResolvedValue([]);

    await expect(
      ensureConfiguredJiraProjectKey({} as never, "owner-1", "ABC"),
    ).resolves.toBeUndefined();
  });
});

describe("requireReportVisibleJiraIssue", () => {
  it("rejects report issue access when the cached issue is not report-visible", async () => {
    const permissions = { canSeeDay: true, canSeePrivate: false };
    findReportVisibleJiraIssue.mockResolvedValue(undefined);

    await expect(
      requireReportVisibleJiraIssue(
        {} as never,
        "manager-1",
        "report-1",
        "EGS-100493",
        permissions,
      ),
    ).rejects.toMatchObject({
      message: "Jira issue is not visible for this report",
      status: 403,
    });
  });

  it("returns the cached report-visible issue", async () => {
    const cached = issue();
    const permissions = { canSeeDay: true, canSeePrivate: false };
    findReportVisibleJiraIssue.mockResolvedValue(cached);

    await expect(
      requireReportVisibleJiraIssue(
        {} as never,
        "manager-1",
        "report-1",
        "EGS-100493",
        permissions,
      ),
    ).resolves.toBe(cached);
  });
});

describe("report Jira REST authorization", () => {
  it("rejects report issue detail before opening Jira when the issue is not report-visible", async () => {
    const adapterFactory = vi.fn(() => ({ getIssue: vi.fn() }) as unknown as JiraAdapter);
    findLiveLink.mockResolvedValue({
      permissions: { canSeeDay: true, canSeePrivate: false },
    });
    findReportVisibleJiraIssue.mockResolvedValue(undefined);

    const response = await appWithSession(adapterFactory).request(
      "/jira/issue?issueIdOrKey=EGS-100493&reportUserId=report-1",
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Jira issue is not visible for this report",
    });
    expect(adapterFactory).not.toHaveBeenCalled();
    expect(getJiraConnection).not.toHaveBeenCalled();
  });

  it("rejects report comment reads before opening Jira when the issue is not report-visible", async () => {
    const adapterFactory = vi.fn(() => ({ listComments: vi.fn() }) as unknown as JiraAdapter);
    findLiveLink.mockResolvedValue({
      permissions: { canSeeDay: true, canSeePrivate: false },
    });
    findReportVisibleJiraIssue.mockResolvedValue(undefined);

    const response = await appWithSession(adapterFactory).request(
      "/jira/comments?issueIdOrKey=EGS-100493&reportUserId=report-1",
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Jira issue is not visible for this report",
    });
    expect(adapterFactory).not.toHaveBeenCalled();
    expect(getJiraConnection).not.toHaveBeenCalled();
  });

  it("rejects create metadata outside the configured project scope before opening Jira", async () => {
    const adapterFactory = vi.fn(() => ({ getCreateMetadata: vi.fn() }) as unknown as JiraAdapter);
    listJiraProjectKeys.mockResolvedValue(["EGS"]);

    const response = await appWithSession(adapterFactory).request(
      "/jira/create-metadata?projectKey=ABC",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Jira project is not configured",
    });
    expect(adapterFactory).not.toHaveBeenCalled();
    expect(getJiraConnection).not.toHaveBeenCalled();
  });
});

describe("syncRouteError", () => {
  it("maps Jira setup and remote failures for sync operations", () => {
    expect(syncRouteError(new Error("JIRA_TOKEN_ENCRYPTION_KEY must be 32 bytes"))).toEqual({
      status: 400,
      message: "JIRA_TOKEN_ENCRYPTION_KEY must be 32 bytes",
    });
    expect(syncRouteError(new JiraHttpError("Jira request failed with 503", 503))).toEqual({
      status: 502,
      message: "Jira request failed with 503",
    });
  });
});

describe("GET /jira/projects", () => {
  it("returns the live Jira project catalog", async () => {
    const listProjects = vi.fn(async () => [
      { key: "EGS", name: "eGain Suite" },
      { key: "KB", name: "Knowledge Base" },
    ]);

    const response = await connectedApp({ listProjects }).request("/jira/projects");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      projects: [
        { key: "EGS", name: "eGain Suite" },
        { key: "KB", name: "Knowledge Base" },
      ],
    });
    expect(listProjects).toHaveBeenCalledTimes(1);
  });
});

describe("Jira JQL presets", () => {
  const preset = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "My bugs",
    jql: "issuetype = Bug",
    isDefault: true,
    createdAt: "2026-09-13T10:00:00.000Z",
    updatedAt: "2026-09-13T10:00:00.000Z",
  };

  it("lists personal Jira JQL presets", async () => {
    listJiraJqlPresets.mockResolvedValue([preset]);

    const response = await appWithSession().request("/jira/jql-presets");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ presets: [preset] });
    expect(listJiraJqlPresets).toHaveBeenCalledWith({} as never, "manager-1");
  });

  it("creates, updates, and deletes a personal Jira JQL preset", async () => {
    createJiraJqlPreset.mockResolvedValue(preset);
    updateJiraJqlPreset.mockResolvedValue({ ...preset, name: "Review" });
    deleteJiraJqlPreset.mockResolvedValue(true);

    const app = appWithSession();
    const created = await app.request("/jira/jql-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My bugs", jql: "issuetype = Bug", isDefault: true }),
    });
    const updated = await app.request(`/jira/jql-presets/${preset.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Review" }),
    });
    const deleted = await app.request(`/jira/jql-presets/${preset.id}`, {
      method: "DELETE",
    });

    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(deleted.status).toBe(200);
    expect(createJiraJqlPreset).toHaveBeenCalledWith({} as never, {
      userId: "manager-1",
      name: "My bugs",
      jql: "issuetype = Bug",
      isDefault: true,
    });
    expect(updateJiraJqlPreset).toHaveBeenCalledWith(
      {} as never,
      "manager-1",
      preset.id,
      { name: "Review" },
    );
    expect(deleteJiraJqlPreset).toHaveBeenCalledWith({} as never, "manager-1", preset.id);
  });

  it("applies a selected preset to personal Jira search", async () => {
    findJiraJqlPreset.mockResolvedValue(preset);
    listJiraProjectKeys.mockResolvedValue(["EGS"]);
    const searchIssues = vi.fn(async (_jql: string) => ({ issues: [issue()], total: 1 }));

    const response = await connectedApp({ searchIssues }).request(
      `/jira/issues?jqlPresetId=${preset.id}&q=login`,
    );

    expect(response.status).toBe(200);
    const jql = String(searchIssues.mock.calls[0]?.[0] ?? "");
    expect(jql).toBe("issuetype = Bug");
  });

  it("prepends a direct key lookup ahead of text search results", async () => {
    listJiraProjectKeys.mockResolvedValue(["EGS"]);
    const direct = issue({ id: "100493", key: "EGS-100493" });
    const textMatch = issue({ id: "200001", key: "EGS-200001", summary: "login bug" });
    const getIssue = vi.fn(async () => direct);
    const searchIssues = vi.fn(async () => ({ issues: [textMatch], total: 1 }));

    const response = await connectedApp({ getIssue, searchIssues }).request(
      "/jira/issues?q=EGS-100493",
    );

    expect(response.status).toBe(200);
    expect(getIssue).toHaveBeenCalledWith("EGS-100493");
    expect(searchIssues).toHaveBeenCalled();
    const body = (await response.json()) as {
      issues: Array<{ key: string }>;
    };
    expect(body.issues.map((item) => item.key)).toEqual(["EGS-100493", "EGS-200001"]);
  });

  it("returns text search results when direct key lookup fails", async () => {
    listJiraProjectKeys.mockResolvedValue(["EGS"]);
    const textMatch = issue({ id: "200001", key: "EGS-200001" });
    const getIssue = vi.fn(async () => {
      throw new Error("missing");
    });
    const searchIssues = vi.fn(async () => ({ issues: [textMatch], total: 1 }));

    const response = await connectedApp({ getIssue, searchIssues }).request(
      "/jira/issues?q=EGS-100493",
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      issues: Array<{ key: string }>;
    };
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0].key).toBe("EGS-200001");
  });

  it("does not prepend a key lookup when paginating past the first page", async () => {
    listJiraProjectKeys.mockResolvedValue(["EGS"]);
    const textMatch = issue({ id: "200001", key: "EGS-200001" });
    const getIssue = vi.fn(async () => issue());
    const searchIssues = vi.fn(async () => ({ issues: [textMatch], total: 50 }));

    const response = await connectedApp({ getIssue, searchIssues }).request(
      "/jira/issues?q=EGS-100493&startAt=25",
    );

    expect(response.status).toBe(200);
    expect(getIssue).not.toHaveBeenCalled();
    const body = (await response.json()) as {
      issues: Array<{ key: string }>;
    };
    expect(body.issues[0].key).toBe("EGS-200001");
  });

  it("applies typed full JQL to personal Jira search", async () => {
    listJiraProjectKeys.mockResolvedValue(["EGS"]);
    const searchIssues = vi.fn(async (_jql: string) => ({ issues: [issue()], total: 1 }));
    const fullJql =
      'status in (Resolved, Closed, Documented, "Fix Verified", "Completed Action Item", "Closed Action Item", "Closed Request", Done, "Feature Ready", "Feature Verified", "Patch Rejected") AND "Last Resolved By" in (currentUser()) ORDER BY updated DESC, status ASC';

    const response = await connectedApp({ searchIssues }).request(
      `/jira/issues?jql=${encodeURIComponent(fullJql)}&q=login&componentIds=20001`,
    );

    expect(response.status).toBe(200);
    const jql = String(searchIssues.mock.calls[0]?.[0] ?? "");
    expect(jql).toBe(fullJql);
  });
});

describe("GET /jira/report/issues", () => {
  it("returns a specific empty reason when the report has no matching Jira user", async () => {
    findLiveLink.mockResolvedValue({
      permissions: { canSeeDay: true, canSeePrivate: false },
    });
    const findUsers = vi.fn(async () => []);
    const searchIssues = vi.fn();

    const response = await connectedApp({ findUsers, searchIssues }).request(
      "/jira/report/issues?userId=priya",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      issues: [],
      reason: "no-jira-user",
    });
    expect(searchIssues).not.toHaveBeenCalled();
  });

  it("falls back to cached assigned issues when live JQL fails", async () => {
    findLiveLink.mockResolvedValue({
      permissions: { canSeeDay: true, canSeePrivate: false },
    });
    listJiraProjectKeys.mockResolvedValue(["EGS"]);
    const cachedIssue = issue({
      assignee: {
        accountId: null,
        key: null,
        name: "priya",
        displayName: "Priya Raman",
        emailAddress: "priya@egain.com",
        active: true,
        avatarUrl: null,
      },
    });
    listJiraIssues.mockResolvedValue([cachedIssue]);
    const findUsers = vi.fn(async () => [
      {
        accountId: null,
        key: null,
        name: "priya",
        displayName: "Priya Raman",
        emailAddress: "priya@egain.com",
        active: true,
        avatarUrl: null,
      },
    ]);
    const searchIssues = vi.fn(async () => {
      throw new Error("JQL failed");
    });

    const response = await connectedApp({ findUsers, searchIssues }).request(
      "/jira/report/issues?userId=priya",
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      issues: Array<{ key: string }>;
    };
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0].key).toBe("EGS-100493");
    expect(searchIssues).toHaveBeenCalled();
  });
});

