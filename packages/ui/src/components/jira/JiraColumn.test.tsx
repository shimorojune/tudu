import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JiraIssue, Task } from "@tudu/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JiraColumn } from "./JiraColumn";

const dispatch = vi.hoisted(() => vi.fn());
const invalidateTags = vi.hoisted(() => vi.fn());
const linkJiraTask = vi.hoisted(() => vi.fn());
const createJiraJqlPreset = vi.hoisted(() => vi.fn());
const refreshJiraComponents = vi.hoisted(() => vi.fn());
const issueListRefetch = vi.hoisted(() => vi.fn());
const mutationResult = vi.hoisted(() => ({
  unwrap: () => Promise.resolve({}),
}));
const searchState = vi.hoisted(() => ({
  issues: [] as JiraIssue[],
  isLoading: false,
  isFetching: false,
  isError: false,
  reason: undefined as "no-jira-user" | undefined,
  lastArgs: undefined as unknown,
}));
const connectionState = vi.hoisted(() => ({
  connected: true,
  isLoading: false,
  projectKeys: ["EGS"] as string[],
}));
const componentState = vi.hoisted(() => ({
  components: [
    {
      id: "20001",
      name: "Knowledge Base",
      projectKey: "EGS",
      description: null,
      archived: false,
    },
  ],
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
    useGetJiraConnectionQuery: () => ({
      data: {
        connection: {
          connected: connectionState.connected,
          baseUrl: connectionState.connected ? "https://jira.example.test" : null,
          displayName: connectionState.connected ? "Test User" : null,
          email: connectionState.connected ? "testuser@example.test" : null,
          projectKeys: connectionState.projectKeys,
          updatedAt: "2026-09-11T08:00:00.000Z",
        },
      },
      isLoading: connectionState.isLoading,
      isError: false,
    }),
    useGetJiraComponentsRestQuery: () => ({
      data: {
        components: componentState.components,
      },
      isLoading: false,
    }),
    useGetJiraJqlPresetsQuery: () => ({
      data: {
        presets: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "My bugs",
            jql: "issuetype = Bug",
            isDefault: true,
            createdAt: "2026-09-13T10:00:00.000Z",
            updatedAt: "2026-09-13T10:00:00.000Z",
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "My Resolved",
            jql: "status = Resolved",
            isDefault: false,
            createdAt: "2026-09-13T10:00:00.000Z",
            updatedAt: "2026-09-13T10:00:00.000Z",
          },
        ],
      },
      isLoading: false,
    }),
    useSearchJiraIssuesQuery: (args: unknown) => {
      searchState.lastArgs = args;
      return {
      data: { issues: searchState.issues, reason: searchState.reason },
      isLoading: searchState.isLoading,
      isFetching: searchState.isFetching,
      isError: searchState.isError,
      refetch: issueListRefetch,
      };
    },
    useSearchReportJiraIssuesQuery: (args: unknown) => {
      searchState.lastArgs = args;
      return {
      data: { issues: searchState.issues, reason: searchState.reason },
      isLoading: searchState.isLoading,
      isFetching: searchState.isFetching,
      isError: searchState.isError,
      refetch: issueListRefetch,
      };
    },
    useRefreshJiraIssuesMutation: () => [vi.fn(() => mutationResult), { isLoading: false }],
    useRefreshJiraComponentsMutation: () => [
      refreshJiraComponents,
      { isLoading: false },
    ],
    useLinkJiraTaskMutation: () => [linkJiraTask, { isLoading: false }],
    useCreateJiraJqlPresetMutation: () => [
      createJiraJqlPreset,
      { isLoading: false },
    ],
  };
});

vi.mock("react-redux", () => ({
  useDispatch: () => dispatch,
}));

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

describe("JiraColumn", () => {
  beforeEach(() => {
    connectionState.connected = true;
    connectionState.isLoading = false;
    connectionState.projectKeys = ["EGS"];
    componentState.components = [
      {
        id: "20001",
        name: "Knowledge Base",
        projectKey: "EGS",
        description: null,
        archived: false,
      },
    ];
    searchState.issues = [makeIssue()];
    searchState.isLoading = false;
    searchState.isFetching = false;
    searchState.isError = false;
    searchState.reason = undefined;
    searchState.lastArgs = undefined;
    linkJiraTask.mockReset();
    createJiraJqlPreset.mockReset();
    refreshJiraComponents.mockReset();
    issueListRefetch.mockReset();
    dispatch.mockReset();
    invalidateTags.mockReset();
    invalidateTags.mockReturnValue({ type: "invalidate" });
    linkJiraTask.mockReturnValue(mutationResult);
    createJiraJqlPreset.mockReturnValue(mutationResult);
    refreshJiraComponents.mockReturnValue(mutationResult);
  });

  it("keeps the issue list visible and reports preview clicks", async () => {
    const user = userEvent.setup();
    const onPreviewIssue = vi.fn();
    render(
      <JiraColumn
        selectedTask={makeTask()}
        selectedDate="2026-09-11"
        onPreviewIssue={onPreviewIssue}
      />,
    );

    expect(screen.getByText("EGS-123")).toBeInTheDocument();
    expect(screen.getByText("Remote Jira summary")).toBeInTheDocument();
    expect(screen.getByText("Existing linked task")).toBeInTheDocument();
    expect(screen.queryByLabelText("Jira summary")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open Jira issue EGS-123" }));
    expect(onPreviewIssue).toHaveBeenCalledWith("EGS-123");
    expect(screen.getByText("Remote Jira summary")).toBeInTheDocument();
  });

  it("links the selected task from the row context menu", async () => {
    const user = userEvent.setup();
    render(<JiraColumn selectedTask={makeTask()} selectedDate="2026-09-11" />);

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: "Open Jira issue EGS-123" }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "Link selected task" }));

    expect(linkJiraTask).toHaveBeenCalledWith({
      taskId: "11111111-1111-4111-8111-111111111111",
      issueIdOrKey: "EGS-123",
    });
    expect(issueListRefetch).toHaveBeenCalledTimes(1);
    expect(invalidateTags).toHaveBeenCalledWith(["JiraIssue"]);
  });

  it("shows inline link errors in the Jira issue list", async () => {
    const user = userEvent.setup();
    linkJiraTask.mockReturnValue({
      unwrap: () =>
        Promise.reject({ data: { error: "Jira issue is not visible" } }),
    });

    render(<JiraColumn selectedTask={makeTask()} selectedDate="2026-09-11" />);
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: "Open Jira issue EGS-123" }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "Link selected task" }));

    expect(await screen.findByText("Jira issue is not visible")).toBeInTheDocument();
    expect(issueListRefetch).not.toHaveBeenCalled();
  });

  it("explains how to connect when Jira is not connected", () => {
    connectionState.connected = false;
    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    expect(screen.getByText("No JIRA connected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect JIRA" })).toHaveAttribute(
      "href",
      "/settings?section=jira",
    );
  });

  it("shows Jira search failures before the empty state", () => {
    searchState.issues = [];
    searchState.isError = true;

    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    expect(screen.getByText("Could not load Jira issues.")).toBeInTheDocument();
    expect(screen.queryByText("No Jira issues")).not.toBeInTheDocument();
  });

  it("refetches the visible issue query after retry refresh succeeds", async () => {
    const user = userEvent.setup();
    searchState.issues = [];
    searchState.isError = true;

    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(issueListRefetch).toHaveBeenCalledTimes(1);
  });

  it("explains when a report has no matching Jira user", () => {
    searchState.issues = [];
    searchState.reason = "no-jira-user";

    render(
      <JiraColumn
        selectedTask={null}
        selectedDate="2026-09-11"
        reportName="Priya Raman"
      />,
    );

    expect(screen.getByText("This report has no matching Jira user.")).toBeInTheDocument();
    expect(screen.queryByText("Could not load Jira issues.")).not.toBeInTheDocument();
  });

  it("keeps the list clickable and spins only the refresh control while fetching", () => {
    searchState.isFetching = true;
    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    expect(screen.getByText("Remote Jira summary")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading Jira issues")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Refresh Jira issues")).toBeInTheDocument();
    expect(screen.getByText("Remote Jira summary").closest("[aria-busy]")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("does not bold Jira row titles", () => {
    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    expect(screen.getByText("Remote Jira summary").tagName).toBe("H3");
    expect(screen.getByText("Remote Jira summary")).not.toHaveClass("font-bold");
  });

  it("keeps search, Component, and JQL controls compact with labelled issue meta", () => {
    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    const controls = screen.getByLabelText("Search Jira issues").parentElement;
    expect(controls).toHaveClass("flex");
    expect(controls).toContainElement(screen.getByLabelText("Filter by Component"));
    expect(screen.getByLabelText("JQL preset")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom JQL" })).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.queryByText("Stage: In Progress")).not.toBeInTheDocument();
    expect(
      screen.getByText("Type: Bug / Assignee: Test User / Due: Sat 12 Sep"),
    ).toBeInTheDocument();
  });

  it("shows a skeleton while switching JQL presets", async () => {
    const user = userEvent.setup();
    searchState.issues = [makeIssue()];
    searchState.isFetching = false;

    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    expect(screen.getByText("EGS-123")).toBeInTheDocument();

    searchState.isFetching = true;
    await user.click(screen.getByLabelText("JQL preset"));
    await user.click(await screen.findByRole("option", { name: "My Resolved" }));

    expect(screen.getByLabelText("Loading Jira issues")).toBeInTheDocument();
    expect(screen.queryByText("EGS-123")).not.toBeInTheDocument();
  });

  it("uses the JQL preset select for preset selection", async () => {
    const user = userEvent.setup();

    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    await user.click(screen.getByLabelText("JQL preset"));
    await user.click(await screen.findByRole("option", { name: "My bugs (default)" }));

    expect(searchState.lastArgs).toMatchObject({
      jqlPresetId: "11111111-1111-4111-8111-111111111111",
      jql: "",
    });
  });

  it("saves custom JQL as a preset from the dialog", async () => {
    const user = userEvent.setup();
    const fullJql = "project = EGS AND status = Open";
    createJiraJqlPreset.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          preset: {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Open EGS",
            jql: fullJql,
            isDefault: false,
            createdAt: "2026-09-13T10:00:00.000Z",
            updatedAt: "2026-09-13T10:00:00.000Z",
          },
        }),
    });

    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    await user.click(screen.getByRole("button", { name: "Custom JQL" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Custom JQL"), fullJql);
    await user.type(within(dialog).getByLabelText("JQL preset name"), "Open EGS");
    await user.click(within(dialog).getByRole("button", { name: "Save preset" }));

    expect(createJiraJqlPreset).toHaveBeenCalledWith({
      name: "Open EGS",
      jql: fullJql,
      isDefault: false,
    });
    expect(searchState.lastArgs).toMatchObject({
      jql: "",
      jqlPresetId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("applies typed full JQL from the custom JQL dialog", async () => {
    const user = userEvent.setup();
    const fullJql =
      'status in (Resolved, Closed) AND "Last Resolved By" in (currentUser()) ORDER BY updated DESC, status ASC';

    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    await user.click(screen.getByRole("button", { name: "Custom JQL" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Custom JQL"), fullJql);
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));

    expect(searchState.lastArgs).toMatchObject({
      jql: fullJql,
      jqlPresetId: null,
    });
    expect(createJiraJqlPreset).not.toHaveBeenCalled();
  });

  it("clears custom JQL back to the default assigned query", async () => {
    const user = userEvent.setup();

    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    await user.click(screen.getByRole("button", { name: "Custom JQL" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Custom JQL"), "project = EGS");
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));
    await user.click(screen.getByLabelText("JQL preset"));
    await user.click(
      await screen.findByRole("option", { name: "Assigned unresolved issues" }),
    );

    expect(searchState.lastArgs).toMatchObject({
      jql: "",
      jqlPresetId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("refreshes Components when a connected project has no cached Components", async () => {
    componentState.components = [];

    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    await waitFor(() => {
      expect(refreshJiraComponents).toHaveBeenCalled();
    });
  });

  it("shows a skeleton instead of empty Jira list space on initial load", () => {
    searchState.issues = [];
    connectionState.isLoading = true;

    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    expect(screen.getByLabelText("Loading Jira issues")).toBeInTheDocument();
    expect(screen.queryByText("Loading Jira connection...")).not.toBeInTheDocument();
  });

  it("shows a skeleton while refetching the first page but keeps issues during load more", () => {
    searchState.issues = [];
    connectionState.isLoading = false;
    searchState.isFetching = true;

    const { rerender } = render(
      <JiraColumn selectedTask={null} selectedDate="2026-09-11" />,
    );

    expect(screen.getByLabelText("Loading Jira issues")).toBeInTheDocument();

    searchState.issues = [makeIssue()];
    searchState.isFetching = true;
    rerender(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    expect(screen.queryByLabelText("Loading Jira issues")).not.toBeInTheDocument();
    expect(screen.getByText("EGS-123")).toBeInTheDocument();
  });

  it("fires onCreateTask from the row context menu", async () => {
    const user = userEvent.setup();
    const onCreateTask = vi.fn();
    render(
      <JiraColumn
        selectedTask={null}
        selectedDate="2026-09-11"
        onCreateTask={onCreateTask}
      />,
    );

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: "Open Jira issue EGS-123" }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "Create task" }));

    expect(onCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ key: "EGS-123", summary: "Remote Jira summary" }),
    );
  });

  it("does not dump Components as chips", () => {
    render(<JiraColumn selectedTask={null} selectedDate="2026-09-11" />);

    expect(screen.getByRole("button", { name: "Filter by Component" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All Components" })).not.toBeInTheDocument();
  });
});
