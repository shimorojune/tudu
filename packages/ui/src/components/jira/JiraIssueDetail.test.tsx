import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JiraIssue, ManagerPermissions, Task } from "@tudu/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JiraIssueDetail } from "./JiraIssueDetail";

const linkJiraTask = vi.hoisted(() => vi.fn());
const unlinkJiraTask = vi.hoisted(() => vi.fn());
const spawnJiraTask = vi.hoisted(() => vi.fn());
const spawnReportJiraTask = vi.hoisted(() => vi.fn());
const createJiraComment = vi.hoisted(() => vi.fn());
const updateJiraIssueFields = vi.hoisted(() => vi.fn());
const searchJiraUsers = vi.hoisted(() => vi.fn());
const issueDetailRefetch = vi.hoisted(() => vi.fn());
const commentsRefetch = vi.hoisted(() => vi.fn());
const dispatch = vi.hoisted(() => vi.fn());
const invalidateTags = vi.hoisted(() => vi.fn());
const mutationResult = vi.hoisted(() => ({
  unwrap: () => Promise.resolve({ task: { id: "33333333-3333-4333-8333-333333333333" } }),
}));
const commentsState = vi.hoisted(() => ({
  comments: [] as ReturnType<typeof makeComment>[],
  isLoading: false,
  isError: false,
}));
const detailState = vi.hoisted(() => ({
  issue: undefined as JiraIssue | undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("react-redux", () => ({
  useDispatch: () => dispatch,
}));

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    jiraApi: {
      util: {
        invalidateTags,
      },
    },
    useGetJiraIssueRestQuery: (_arg: unknown, options?: { skip?: boolean }) => ({
      data: options?.skip ? undefined : { issue: detailState.issue },
      isLoading: detailState.isLoading,
      isFetching: detailState.isFetching,
      isError: detailState.isError,
      refetch: issueDetailRefetch,
    }),
    useGetJiraCommentsRestQuery: () => ({
      data: { comments: commentsState.comments },
      isLoading: commentsState.isLoading,
      isError: commentsState.isError,
      refetch: commentsRefetch,
    }),
    useLinkJiraTaskMutation: () => [linkJiraTask, { isLoading: false }],
    useUnlinkJiraTaskMutation: () => [unlinkJiraTask, { isLoading: false }],
    useSpawnJiraTaskMutation: () => [spawnJiraTask, { isLoading: false }],
    useSpawnReportJiraTaskMutation: () => [spawnReportJiraTask, { isLoading: false }],
    useCreateJiraCommentMutation: () => [createJiraComment, { isLoading: false }],
    useUpdateJiraIssueFieldsMutation: () => [
      updateJiraIssueFields,
      { isLoading: false },
    ],
    useUpdateJiraIssueAssigneeMutation: () => [vi.fn(), { isLoading: false }],
    useLazySearchJiraUsersQuery: () => [searchJiraUsers, { isFetching: false }],
  };
});

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Local follow up",
    description: null,
    scheduledDate: "2026-09-11",
    bucket: "now",
    position: 0,
    startDate: null,
    deadline: null,
    completedAt: null,
    inProgress: false,
    carriedDays: 0,
    carriedSince: null,
    isPrivate: false,
    createdAt: "2026-09-11T08:00:00.000Z",
    updatedAt: "2026-09-11T08:00:00.000Z",
    commentCount: 0,
    project: null,
    jiraLinks: [],
    subtasks: [],
    ...overrides,
  };
}

function makeIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    id: "10001",
    key: "EGS-123",
    summary: "Remote Jira summary",
    description: "Remote description",
    status: { id: "3", name: "In Progress", category: "indeterminate" },
    issueType: "Bug",
    priority: "High",
    assignee: {
      accountId: null,
      key: null,
      name: "testuser",
      displayName: "Test User",
      emailAddress: "testuser@example.test",
      active: true,
      avatarUrl: null,
    },
    dueDate: "2026-09-12",
    components: [
      {
        id: "20001",
        name: "Knowledge Base",
        projectKey: "EGS",
        description: null,
        archived: false,
      },
    ],
    updatedAt: "2026-09-11T09:00:00.000Z",
    browseUrl: "https://jira.example.test/browse/EGS-123",
    linkedTasks: [
      {
        taskId: "22222222-2222-4222-8222-222222222222",
        title: "Existing linked task",
        isPrivate: false,
      },
    ],
    editableFields: ["summary", "description", "duedate", "assignee"],
    ...overrides,
  };
}

function makeComment() {
  return {
    id: "90001",
    issueId: "10001",
    issueKey: "EGS-123",
    author: {
      accountId: null,
      key: null,
      name: "testuser",
      displayName: "Test User",
      emailAddress: "testuser@example.test",
      active: true,
      avatarUrl: null,
    },
    body: "Jira comment body",
    renderedBody: null,
    createdAt: "2026-09-11T09:30:00.000Z",
    updatedAt: "2026-09-11T09:30:00.000Z",
  };
}

describe("JiraIssueDetail", () => {
  beforeEach(() => {
    detailState.issue = makeIssue();
    commentsState.comments = [makeComment()];
    commentsState.isLoading = false;
    commentsState.isError = false;
    detailState.isLoading = false;
    detailState.isFetching = false;
    detailState.isError = false;
    linkJiraTask.mockReset();
    unlinkJiraTask.mockReset();
    spawnJiraTask.mockReset();
    spawnReportJiraTask.mockReset();
    createJiraComment.mockReset();
    updateJiraIssueFields.mockReset();
    searchJiraUsers.mockReset();
    issueDetailRefetch.mockReset();
    commentsRefetch.mockReset();
    dispatch.mockReset();
    invalidateTags.mockReset();
    invalidateTags.mockReturnValue({ type: "invalidate" });
    linkJiraTask.mockReturnValue(mutationResult);
    unlinkJiraTask.mockReturnValue(mutationResult);
    spawnJiraTask.mockReturnValue(mutationResult);
    spawnReportJiraTask.mockReturnValue(mutationResult);
    createJiraComment.mockReturnValue(mutationResult);
    updateJiraIssueFields.mockReturnValue(mutationResult);
    searchJiraUsers.mockReturnValue(mutationResult);
  });

  it("opens issue detail from the full REST snapshot with editable fields and Jira comments", async () => {
    const user = userEvent.setup();
    detailState.issue = makeIssue({ description: "Full REST description" });
    render(
      <JiraIssueDetail
        issueIdOrKey="EGS-123"
        selectedTask={makeTask()}
        selectedDate="2026-09-11"
        onBack={() => {}}
      />,
    );

    expect(screen.getByLabelText("Jira summary")).toHaveValue("Remote Jira summary");
    expect(screen.getByLabelText("Jira summary").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Jira summary")).toHaveClass("whitespace-pre-wrap");
    expect(screen.getByLabelText("Jira summary")).not.toHaveClass("font-bold");
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Jira description" })).toHaveValue(
        "Full REST description",
      );
    });
    expect(screen.getByText("Jira comment body")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Jira fields" })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Jira summary"));
    await user.type(screen.getByLabelText("Jira summary"), "Updated summary");
    await user.click(screen.getByRole("button", { name: "Save Jira fields" }));

    expect(updateJiraIssueFields).toHaveBeenCalledWith({
      issueIdOrKey: "EGS-123",
      summary: "Updated summary",
    });
    expect(issueDetailRefetch).toHaveBeenCalledTimes(1);
  });

  it("renders sanitized Jira rich text while keeping raw wiki text editable", () => {
    detailState.issue = makeIssue({
      description: "*Raw wiki*",
      renderedDescription:
        '<p onclick="alert(1)"><strong>Rendered wiki</strong><script>alert(1)</script><a href="javascript:alert(1)">bad</a></p>',
      editableFields: [],
    });
    commentsState.comments = [
      {
        ...makeComment(),
        renderedBody:
          '<p><em>Rendered comment</em><a href="https://jira.example.test/browse/EGS-123">Issue</a></p>',
      },
    ];

    render(
      <JiraIssueDetail
        issueIdOrKey="EGS-123"
        selectedTask={null}
        selectedDate="2026-09-11"
        onBack={() => {}}
      />,
    );

    expect(screen.getByText("Rendered wiki")).toBeInTheDocument();
    expect(screen.getByText("bad")).not.toHaveAttribute("href");
    expect(screen.getByText("Rendered comment")).toBeInTheDocument();
    expect(screen.getByText("Issue")).toHaveAttribute("target", "_blank");
    expect(screen.queryByText("Raw wiki")).not.toBeInTheDocument();
  });

  it("refreshes detail data after link, unlink, and comment mutations", async () => {
    const user = userEvent.setup();
    render(
      <JiraIssueDetail
        issueIdOrKey="EGS-123"
        selectedTask={makeTask()}
        selectedDate="2026-09-11"
        onBack={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Link selected task" }));
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    const commentEditor = screen.getByRole("textbox", { name: "Jira comment" });
    await user.type(commentEditor, "New Jira note");
    await user.click(screen.getByRole("button", { name: "Add Jira comment" }));

    expect(linkJiraTask).toHaveBeenCalledWith({
      taskId: "11111111-1111-4111-8111-111111111111",
      issueIdOrKey: "EGS-123",
    });
    expect(unlinkJiraTask).toHaveBeenCalledWith({
      taskId: "22222222-2222-4222-8222-222222222222",
      issueIdOrKey: "EGS-123",
    });
    expect(createJiraComment).toHaveBeenCalledWith({
      issueIdOrKey: "EGS-123",
      body: "New Jira note",
    });
    expect(issueDetailRefetch).toHaveBeenCalledTimes(2);
    expect(commentsRefetch).toHaveBeenCalledTimes(1);
    expect(invalidateTags).toHaveBeenCalledWith(["JiraIssue"]);
    expect(dispatch).toHaveBeenCalledWith({ type: "invalidate" });
  });

  it("opens create-task from the preview button", async () => {
    const user = userEvent.setup();
    const onCreateTask = vi.fn();
    render(
      <JiraIssueDetail
        issueIdOrKey="EGS-123"
        selectedTask={null}
        selectedDate="2026-09-11"
        onBack={() => {}}
        onCreateTask={onCreateTask}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create task" }));

    expect(onCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ key: "EGS-123", summary: "Remote Jira summary" }),
    );
    expect(spawnJiraTask).not.toHaveBeenCalled();
  });

  it("uses an icon close, puts create task by the title, and labels metadata", () => {
    render(
      <JiraIssueDetail
        issueIdOrKey="EGS-123"
        selectedTask={null}
        selectedDate="2026-09-11"
        onBack={() => {}}
        onCreateTask={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Close Jira preview")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create task" }).closest("header")).toBeTruthy();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.queryByText("Stage: In Progress")).not.toBeInTheDocument();
    expect(screen.getByText("Assignee: Test User")).toBeInTheDocument();
    expect(screen.getByText("Due: Sat 12 Sep")).toBeInTheDocument();
    expect(screen.getByText("Component: Knowledge Base")).toBeInTheDocument();
  });

  it("shows the Jira comment composer above the comments list", () => {
    render(
      <JiraIssueDetail
        issueIdOrKey="EGS-123"
        selectedTask={null}
        selectedDate="2026-09-11"
        onBack={() => {}}
      />,
    );

    const body = screen.getByLabelText("Jira comment");
    const existingComment = screen.getByText("Jira comment body");
    expect(body.compareDocumentPosition(existingComment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens create-task from the preview button", async () => {
    const user = userEvent.setup();
    const onCreateTask = vi.fn();
    render(
      <JiraIssueDetail
        issueIdOrKey="EGS-123"
        selectedTask={null}
        selectedDate="2026-09-11"
        onBack={() => {}}
        onCreateTask={onCreateTask}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create task" }));

    expect(onCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ key: "EGS-123" }),
    );
  });

  it("shows Jira detail failures instead of loading forever", () => {
    detailState.issue = undefined;
    detailState.isError = true;

    render(
      <JiraIssueDetail
        issueIdOrKey="EGS-123"
        selectedTask={null}
        selectedDate="2026-09-11"
        onBack={() => {}}
      />,
    );

    expect(screen.getByText("Could not load this Jira issue.")).toBeInTheDocument();
    expect(screen.queryByText("Loading Jira issue...")).not.toBeInTheDocument();
  });

  it("shows preview skeleton when switching to another issue before detail loads", () => {
    detailState.issue = makeIssue({ key: "EGS-100", summary: "First issue" });
    detailState.isLoading = false;
    detailState.isFetching = false;

    const { rerender } = render(
      <JiraIssueDetail
        issueIdOrKey="EGS-100"
        selectedTask={null}
        selectedDate="2026-09-11"
        onBack={() => {}}
      />,
    );

    expect(screen.getByText("First issue")).toBeInTheDocument();

    detailState.isFetching = true;
    rerender(
      <JiraIssueDetail
        issueIdOrKey="EGS-200"
        selectedTask={null}
        selectedDate="2026-09-11"
        onBack={() => {}}
      />,
    );

    expect(screen.getByLabelText("Loading Jira issue")).toBeInTheDocument();
    expect(screen.getByText("EGS-200")).toBeInTheDocument();
    expect(screen.queryByText("First issue")).not.toBeInTheDocument();
  });

  it("uses skeletons while loading Jira issue detail and comments", () => {
    detailState.issue = undefined;
    detailState.isLoading = true;

    const { rerender } = render(
      <JiraIssueDetail
        issueIdOrKey="EGS-123"
        selectedTask={null}
        selectedDate="2026-09-11"
        onBack={() => {}}
      />,
    );

    expect(screen.getByLabelText("Loading Jira issue")).toBeInTheDocument();

    detailState.issue = makeIssue();
    detailState.isLoading = false;
    commentsState.comments = [];
    commentsState.isLoading = true;
    rerender(
      <JiraIssueDetail
        issueIdOrKey="EGS-123"
        selectedTask={null}
        selectedDate="2026-09-11"
        onBack={() => {}}
      />,
    );

    expect(screen.getByLabelText("Loading Jira comments")).toBeInTheDocument();
    expect(screen.queryByText("Loading comments...")).not.toBeInTheDocument();
  });

  it("shows Jira comment failures before the empty comments state", () => {
    commentsState.comments = [];
    commentsState.isError = true;

    render(
      <JiraIssueDetail
        issueIdOrKey="EGS-123"
        selectedTask={null}
        selectedDate="2026-09-11"
        onBack={() => {}}
      />,
    );

    expect(screen.getByText("Could not load Jira comments.")).toBeInTheDocument();
    expect(screen.queryByText("No Jira comments yet.")).not.toBeInTheDocument();
  });

});
