import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JiraIssue } from "@tudu/shared";
import { DEFAULT_MANAGER_PERMISSIONS } from "@tudu/shared";
import type { JiraAdapter } from "./jira/client.js";

const claimMutation = vi.hoisted(() => vi.fn());
const emitSync = vi.hoisted(() =>
  vi.fn(
    async (
      _db: unknown,
      input: {
        recipientUserIds: string[];
        clientMutationId: string | null;
        type: string;
        payload: unknown;
      },
    ) =>
      input.recipientUserIds.map((recipientUserId, index) => ({
        seq: index + 1,
        recipientUserId,
        clientMutationId: input.clientMutationId,
        type: input.type,
        payload: input.payload,
      })),
  ),
);
const findReportVisibleJiraIssue = vi.hoisted(() => vi.fn());
const findLiveLink = vi.hoisted(() => vi.fn());
const findCachedJiraIssue = vi.hoisted(() => vi.fn());
const getJiraConnection = vi.hoisted(() => vi.fn());
const insertAndEmitNotifications = vi.hoisted(() => vi.fn());
const insertTimelineEvents = vi.hoisted(() => vi.fn());
const linkTaskToJiraIssue = vi.hoisted(() => vi.fn());
const listInbox = vi.hoisted(() => vi.fn());
const listJiraProjectKeys = vi.hoisted(() => vi.fn());
const listReportInbox = vi.hoisted(() => vi.fn());
const listReportJiraIssues = vi.hoisted(() => vi.fn());
const listTimelineForTask = vi.hoisted(() => vi.fn());
const releaseMutation = vi.hoisted(() => vi.fn());
const resolveTaskAccess = vi.hoisted(() => vi.fn());
const sendInboxTask = vi.hoisted(() => vi.fn());
const softDeleteComment = vi.hoisted(() => vi.fn());
const updateComment = vi.hoisted(() => vi.fn());
const upsertJiraComments = vi.hoisted(() => vi.fn());
const upsertJiraIssue = vi.hoisted(() => vi.fn());
const notifySync = vi.hoisted(() => vi.fn());

vi.mock("@tudu/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/db")>();
  return {
    ...actual,
    claimMutation,
    emitSync,
    findCachedJiraIssue,
    findLiveLink,
    findReportVisibleJiraIssue,
    getJiraConnection,
    insertAndEmitNotifications,
    insertTimelineEvents,
    linkTaskToJiraIssue,
    listInbox,
    listJiraProjectKeys,
    listReportInbox,
    listReportJiraIssues,
    listTimelineForTask,
    releaseMutation,
    resolveTaskAccess,
    sendInboxTask,
    softDeleteComment,
    updateComment,
    upsertJiraComments,
    upsertJiraIssue,
  };
});

vi.mock("./jira/crypto.js", () => ({
  decryptJiraToken: () => "token",
}));

vi.mock("./syncHub.js", () => ({
  notifySync,
}));

const { applySyncOp } = await import("./applySyncOp.js");

function issue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    id: "100493",
    key: "EGS-100493",
    summary: "Investigate login failure",
    description: "Fails on partition one",
    renderedDescription: null,
    status: { id: "1", name: "Open", category: "todo" },
    issueType: "Bug",
    priority: "High",
    assignee: null,
    dueDate: "2026-09-15",
    components: [],
    updatedAt: "2026-09-10T08:00:00.000Z",
    browseUrl: "https://jira.example.test/browse/EGS-100493",
    linkedTasks: [],
    editableFields: [],
    ...overrides,
  };
}

describe("report Jira task spawning", () => {
  beforeEach(() => {
    claimMutation.mockResolvedValue("claimed");
    emitSync.mockClear();
    findCachedJiraIssue.mockReset();
    findLiveLink.mockReset();
    findReportVisibleJiraIssue.mockReset();
    getJiraConnection.mockReset();
    insertAndEmitNotifications.mockReset();
    insertTimelineEvents.mockReset();
    linkTaskToJiraIssue.mockReset();
    listInbox.mockReset();
    listJiraProjectKeys.mockReset();
    listReportInbox.mockReset();
    listReportJiraIssues.mockReset();
    listTimelineForTask.mockReset();
    releaseMutation.mockReset();
    resolveTaskAccess.mockReset();
    sendInboxTask.mockReset();
    softDeleteComment.mockReset();
    updateComment.mockReset();
    upsertJiraComments.mockReset();
    upsertJiraIssue.mockReset();
    notifySync.mockReset();

    findCachedJiraIssue.mockResolvedValue(undefined);
    findReportVisibleJiraIssue.mockResolvedValue(issue());
    getJiraConnection.mockResolvedValue({
      baseUrl: "https://jira.example.test",
      encryptedToken: "encrypted",
      tokenIv: "iv",
      tokenAuthTag: "tag",
    });
    listJiraProjectKeys.mockResolvedValue(["EGS"]);
    listInbox.mockResolvedValue({ pending: [], history: [] });
    listReportInbox.mockResolvedValue({
      report: {
        id: "report-1",
        name: "Priya Raman",
        email: "priya@example.test",
      },
      permissions: DEFAULT_MANAGER_PERMISSIONS,
      pending: [],
      history: [],
    });
    listTimelineForTask.mockResolvedValue([]);
    insertAndEmitNotifications.mockResolvedValue([]);
  });

  it("emits a report-scoped Jira issue snapshot after linking the spawned task", async () => {
    const permissions = {
      ...DEFAULT_MANAGER_PERMISSIONS,
      canSendInbox: true,
    };
    const jiraIssue = issue();
    const reportIssue = issue({
      linkedTasks: [
        {
          taskId: "11111111-1111-4111-8111-111111111111",
          title: "Follow up from Jira",
          isPrivate: false,
        },
      ],
    });
    const getIssue = vi.fn().mockResolvedValue(jiraIssue);
    findLiveLink.mockResolvedValue({ permissions });
    sendInboxTask.mockResolvedValue({
      item: { id: "22222222-2222-4222-8222-222222222222" },
      task: {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Follow up from Jira",
        scheduledDate: null,
      },
    });
    listReportJiraIssues.mockResolvedValue([reportIssue]);

    const result = await applySyncOp(
      {} as never,
      "manager-1",
      "33333333-3333-4333-8333-333333333333",
      {
        type: "jira.reportTask.spawn",
        id: "11111111-1111-4111-8111-111111111111",
        body: {
          reportUserId: "report-1",
          issueId: "100493",
          title: "Follow up from Jira",
          description: null,
          scheduledDate: null,
          bucket: null,
          startDate: null,
          deadline: null,
          projectId: null,
        },
      },
      {
        adapterFactory: () =>
          ({
            getIssue,
          }) as unknown as JiraAdapter,
      },
    );

    expect(linkTaskToJiraIssue).toHaveBeenCalledWith({} as never, {
      userId: "report-1",
      taskId: "11111111-1111-4111-8111-111111111111",
      issueId: "100493",
      issueKey: "EGS-100493",
    });
    expect(listReportJiraIssues).toHaveBeenCalledWith(
      {} as never,
      "manager-1",
      "report-1",
      permissions,
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "jira.reportIssue.upsert",
          payload: {
            reportUserId: "report-1",
            issue: reportIssue,
          },
        }),
      ]),
    );
  });

  it("rejects report task spawning before fetching Jira when send permission is denied", async () => {
    const permissions = {
      ...DEFAULT_MANAGER_PERMISSIONS,
      canSendInbox: false,
    };
    const getIssue = vi.fn();
    const adapterFactory = vi.fn(
      () =>
        ({
          getIssue,
        }) as unknown as JiraAdapter,
    );
    findLiveLink.mockResolvedValue({ permissions });

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "jira.reportTask.spawn",
          id: "11111111-1111-4111-8111-111111111111",
          body: {
            reportUserId: "report-1",
            issueId: "100493",
            title: "Follow up from Jira",
            description: null,
            scheduledDate: null,
            bucket: null,
            startDate: null,
            deadline: null,
            projectId: null,
          },
        },
        {
          adapterFactory,
        },
      ),
    ).rejects.toMatchObject({
      message: "Not allowed to send tasks",
      status: 403,
    });

    expect(adapterFactory).not.toHaveBeenCalled();
    expect(getJiraConnection).not.toHaveBeenCalled();
    expect(getIssue).not.toHaveBeenCalled();
    expect(sendInboxTask).not.toHaveBeenCalled();
  });

  it("rejects report task spawning before fetching Jira when the issue is not report-visible", async () => {
    const permissions = {
      ...DEFAULT_MANAGER_PERMISSIONS,
      canSendInbox: true,
    };
    const getIssue = vi.fn();
    const adapterFactory = vi.fn(
      () =>
        ({
          getIssue,
        }) as unknown as JiraAdapter,
    );
    findLiveLink.mockResolvedValue({ permissions });
    findReportVisibleJiraIssue.mockResolvedValue(undefined);

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "jira.reportTask.spawn",
          id: "11111111-1111-4111-8111-111111111111",
          body: {
            reportUserId: "report-1",
            issueId: "100493",
            title: "Follow up from Jira",
            description: null,
            scheduledDate: null,
            bucket: null,
            startDate: null,
            deadline: null,
            projectId: null,
          },
        },
        {
          adapterFactory,
        },
      ),
    ).rejects.toMatchObject({
      message: "Jira issue is not visible for this report",
      status: 403,
    });

    expect(findReportVisibleJiraIssue).toHaveBeenCalledWith(
      {} as never,
      "manager-1",
      "report-1",
      "100493",
      permissions,
    );
    expect(adapterFactory).not.toHaveBeenCalled();
    expect(getJiraConnection).not.toHaveBeenCalled();
    expect(getIssue).not.toHaveBeenCalled();
    expect(sendInboxTask).not.toHaveBeenCalled();
  });

  it("rejects report field updates before opening Jira when edit permission is denied", async () => {
    const permissions = {
      ...DEFAULT_MANAGER_PERMISSIONS,
      canEdit: false,
    };
    const updateIssue = vi.fn();
    const adapterFactory = vi.fn(
      () =>
        ({
          updateIssue,
        }) as unknown as JiraAdapter,
    );
    findLiveLink.mockResolvedValue({ permissions });

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "jira.issue.updateFields",
          body: {
            issueIdOrKey: "EGS-100493",
            reportUserId: "report-1",
            summary: "Unauthorized update",
          },
        },
        {
          adapterFactory,
        },
      ),
    ).rejects.toMatchObject({
      message: "Not allowed",
      status: 403,
    });

    expect(adapterFactory).not.toHaveBeenCalled();
    expect(getJiraConnection).not.toHaveBeenCalled();
    expect(updateIssue).not.toHaveBeenCalled();
  });

  it("rejects report comments before opening Jira when comment permission is denied", async () => {
    const permissions = {
      ...DEFAULT_MANAGER_PERMISSIONS,
      canComment: false,
    };
    const addComment = vi.fn();
    const adapterFactory = vi.fn(
      () =>
        ({
          addComment,
        }) as unknown as JiraAdapter,
    );
    findLiveLink.mockResolvedValue({ permissions });

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "jira.comment.create",
          id: "11111111-1111-4111-8111-111111111111",
          issueIdOrKey: "EGS-100493",
          reportUserId: "report-1",
          body: "Unauthorized comment",
        },
        {
          adapterFactory,
        },
      ),
    ).rejects.toMatchObject({
      message: "Not allowed",
      status: 403,
    });

    expect(adapterFactory).not.toHaveBeenCalled();
    expect(getJiraConnection).not.toHaveBeenCalled();
    expect(addComment).not.toHaveBeenCalled();
  });

  it("rejects report field updates before opening Jira when the issue is not report-visible", async () => {
    const permissions = {
      ...DEFAULT_MANAGER_PERMISSIONS,
      canEdit: true,
    };
    const updateIssue = vi.fn();
    const adapterFactory = vi.fn(
      () =>
        ({
          updateIssue,
        }) as unknown as JiraAdapter,
    );
    findLiveLink.mockResolvedValue({ permissions });
    findReportVisibleJiraIssue.mockResolvedValue(undefined);

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "jira.issue.updateFields",
          body: {
            issueIdOrKey: "EGS-100493",
            reportUserId: "report-1",
            summary: "Unauthorized update",
          },
        },
        {
          adapterFactory,
        },
      ),
    ).rejects.toMatchObject({
      message: "Jira issue is not visible for this report",
      status: 403,
    });

    expect(findReportVisibleJiraIssue).toHaveBeenCalledWith(
      {} as never,
      "manager-1",
      "report-1",
      "EGS-100493",
      permissions,
    );
    expect(adapterFactory).not.toHaveBeenCalled();
    expect(getJiraConnection).not.toHaveBeenCalled();
    expect(updateIssue).not.toHaveBeenCalled();
  });

  it("rejects report comments before opening Jira when the issue is not report-visible", async () => {
    const permissions = {
      ...DEFAULT_MANAGER_PERMISSIONS,
      canComment: true,
    };
    const addComment = vi.fn();
    const adapterFactory = vi.fn(
      () =>
        ({
          addComment,
        }) as unknown as JiraAdapter,
    );
    findLiveLink.mockResolvedValue({ permissions });
    findReportVisibleJiraIssue.mockResolvedValue(undefined);

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "jira.comment.create",
          id: "11111111-1111-4111-8111-111111111111",
          issueIdOrKey: "EGS-100493",
          reportUserId: "report-1",
          body: "Unauthorized comment",
        },
        {
          adapterFactory,
        },
      ),
    ).rejects.toMatchObject({
      message: "Jira issue is not visible for this report",
      status: 403,
    });

    expect(findReportVisibleJiraIssue).toHaveBeenCalledWith(
      {} as never,
      "manager-1",
      "report-1",
      "EGS-100493",
      permissions,
    );
    expect(adapterFactory).not.toHaveBeenCalled();
    expect(getJiraConnection).not.toHaveBeenCalled();
    expect(addComment).not.toHaveBeenCalled();
  });

  it("rejects creating and linking a Jira issue before remote create when report edit permission is denied", async () => {
    const createIssue = vi.fn().mockResolvedValue(issue());
    const adapterFactory = vi.fn(
      () =>
        ({
          createIssue,
        }) as unknown as JiraAdapter,
    );
    resolveTaskAccess.mockResolvedValue({
      role: "manager",
      task: {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "report-1",
      },
      permissions: {
        ...DEFAULT_MANAGER_PERMISSIONS,
        canEdit: false,
      },
    });

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "jira.issue.create",
          id: "44444444-4444-4444-8444-444444444444",
          body: {
            projectKey: "EGS",
            issueTypeId: "10001",
            summary: "Unauthorized create",
            description: null,
            dueDate: null,
            assignee: null,
            componentIds: [],
            fields: {},
            linkTaskId: "11111111-1111-4111-8111-111111111111",
          },
        },
        {
          adapterFactory,
        },
      ),
    ).rejects.toMatchObject({
      message: "Not allowed",
      status: 403,
    });

    expect(resolveTaskAccess).toHaveBeenCalledWith(
      {} as never,
      "manager-1",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(adapterFactory).not.toHaveBeenCalled();
    expect(getJiraConnection).not.toHaveBeenCalled();
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("rejects creating Jira issues outside the configured project scope before opening Jira", async () => {
    const createIssue = vi.fn().mockResolvedValue(issue({ key: "ABC-7" }));
    const adapterFactory = vi.fn(
      () =>
        ({
          createIssue,
        }) as unknown as JiraAdapter,
    );
    listJiraProjectKeys.mockResolvedValue(["EGS"]);

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "jira.issue.create",
          id: "44444444-4444-4444-8444-444444444444",
          body: {
            projectKey: "ABC",
            issueTypeId: "10001",
            summary: "Out of scope create",
            description: null,
            dueDate: null,
            assignee: null,
            componentIds: [],
            fields: {},
            linkTaskId: null,
          },
        },
        {
          adapterFactory,
        },
      ),
    ).rejects.toMatchObject({
      message: "Jira project is not configured",
      status: 400,
    });

    expect(adapterFactory).not.toHaveBeenCalled();
    expect(getJiraConnection).not.toHaveBeenCalled();
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("keeps a Jira issue create mutation claimed after the remote issue exists", async () => {
    const createIssue = vi.fn().mockResolvedValue(issue());
    const adapterFactory = vi.fn(
      () =>
        ({
          createIssue,
        }) as unknown as JiraAdapter,
    );
    upsertJiraIssue.mockRejectedValueOnce(new Error("local write failed"));

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "jira.issue.create",
          id: "44444444-4444-4444-8444-444444444444",
          body: {
            projectKey: "EGS",
            issueTypeId: "10001",
            summary: "Create once",
            description: null,
            dueDate: null,
            assignee: null,
            componentIds: [],
            fields: {},
            linkTaskId: null,
          },
        },
        {
          adapterFactory,
        },
      ),
    ).rejects.toThrow("local write failed");

    expect(createIssue).toHaveBeenCalledOnce();
    expect(releaseMutation).not.toHaveBeenCalled();
  });

  it("keeps a Jira issue create mutation claimed when the remote create outcome is ambiguous", async () => {
    const createIssue = vi.fn().mockRejectedValue(new Error("network dropped"));
    const adapterFactory = vi.fn(
      () =>
        ({
          createIssue,
        }) as unknown as JiraAdapter,
    );

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "jira.issue.create",
          id: "44444444-4444-4444-8444-444444444444",
          body: {
            projectKey: "EGS",
            issueTypeId: "10001",
            summary: "Create once",
            description: null,
            dueDate: null,
            assignee: null,
            componentIds: [],
            fields: {},
            linkTaskId: null,
          },
        },
        {
          adapterFactory,
        },
      ),
    ).rejects.toThrow("network dropped");

    expect(createIssue).toHaveBeenCalledOnce();
    expect(releaseMutation).not.toHaveBeenCalled();
  });

  it("keeps a Jira comment mutation claimed after the remote comment exists", async () => {
    const addComment = vi.fn().mockResolvedValue({
      id: "comment-1",
      issueId: "100493",
      issueKey: "EGS-100493",
      author: {
        accountId: null,
        key: "manager",
        name: "manager",
        displayName: "Manager",
        emailAddress: "manager@example.test",
        active: true,
        avatarUrl: null,
      },
      body: "Create once",
      createdAt: "2026-09-10T08:00:00.000Z",
      updatedAt: "2026-09-10T08:00:00.000Z",
    });
    const adapterFactory = vi.fn(
      () =>
        ({
          addComment,
        }) as unknown as JiraAdapter,
    );
    upsertJiraComments.mockRejectedValueOnce(new Error("local write failed"));

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "jira.comment.create",
          id: "11111111-1111-4111-8111-111111111111",
          issueIdOrKey: "EGS-100493",
          body: "Create once",
        },
        {
          adapterFactory,
        },
      ),
    ).rejects.toThrow("local write failed");

    expect(addComment).toHaveBeenCalledOnce();
    expect(releaseMutation).not.toHaveBeenCalled();
  });

  it("keeps a Jira comment mutation claimed when the remote comment outcome is ambiguous", async () => {
    const addComment = vi.fn().mockRejectedValue(new Error("network dropped"));
    const adapterFactory = vi.fn(
      () =>
        ({
          addComment,
        }) as unknown as JiraAdapter,
    );

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "jira.comment.create",
          id: "11111111-1111-4111-8111-111111111111",
          issueIdOrKey: "EGS-100493",
          body: "Create once",
        },
        {
          adapterFactory,
        },
      ),
    ).rejects.toThrow("network dropped");

    expect(addComment).toHaveBeenCalledOnce();
    expect(releaseMutation).not.toHaveBeenCalled();
  });

  it("rejects report task comment edits before mutating when comment permission is denied", async () => {
    resolveTaskAccess.mockResolvedValue({
      role: "manager",
      task: {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "report-1",
        title: "Report task",
        scheduledDate: "2026-09-13",
      },
      permissions: {
        ...DEFAULT_MANAGER_PERMISSIONS,
        canComment: false,
      },
    });

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "comment.update",
          id: "22222222-2222-4222-8222-222222222222",
          taskId: "11111111-1111-4111-8111-111111111111",
          patch: { body: "Edited without permission" },
        },
      ),
    ).rejects.toMatchObject({
      message: "Not allowed",
      status: 403,
    });

    expect(updateComment).not.toHaveBeenCalled();
  });

  it("rejects report task comment deletes before mutating when comment permission is denied", async () => {
    resolveTaskAccess.mockResolvedValue({
      role: "manager",
      task: {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "report-1",
        title: "Report task",
        scheduledDate: "2026-09-13",
      },
      permissions: {
        ...DEFAULT_MANAGER_PERMISSIONS,
        canComment: false,
      },
    });

    await expect(
      applySyncOp(
        {} as never,
        "manager-1",
        "33333333-3333-4333-8333-333333333333",
        {
          type: "comment.delete",
          id: "22222222-2222-4222-8222-222222222222",
          taskId: "11111111-1111-4111-8111-111111111111",
        },
      ),
    ).rejects.toMatchObject({
      message: "Not allowed",
      status: 403,
    });

    expect(softDeleteComment).not.toHaveBeenCalled();
  });
});
