import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JiraIssue, Task } from "@tudu/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinkJiraPalette } from "./LinkJiraPalette";

const linkJiraTask = vi.hoisted(() => vi.fn());
const createJiraIssue = vi.hoisted(() => vi.fn());
const jiraState = vi.hoisted(() => ({
  connected: true,
  issues: [] as JiraIssue[],
  searchError: false,
  isFetching: false,
}));
const invalidateJiraIssues = vi.hoisted(() => vi.fn());
const dispatch = vi.hoisted(() => vi.fn());
const mutationResult = vi.hoisted(() => ({
  unwrap: () => Promise.resolve({}),
}));

vi.mock("@tudu/store", () => ({
  jiraApi: {
    util: {
      invalidateTags: invalidateJiraIssues,
    },
  },
  useGetJiraStatusRestQuery: () => ({
    data: {
      connection: {
        connected: jiraState.connected,
        baseUrl: jiraState.connected ? "https://jira.example.test" : null,
        displayName: jiraState.connected ? "Test User" : null,
        email: jiraState.connected ? "testuser@example.test" : null,
        projectKeys: ["EGS"],
        updatedAt: jiraState.connected ? "2026-09-11T08:00:00.000Z" : null,
      },
    },
    isLoading: false,
  }),
  useSearchJiraIssuesQuery: () => ({
    data: { issues: jiraState.issues },
    isLoading: false,
    isFetching: jiraState.isFetching,
    isError: jiraState.searchError,
  }),
  useGetJiraCreateMetadataQuery: () => ({
    data: {
      metadata: {
        projectKey: "EGS",
        issueTypes: [
          {
            id: "10001",
            name: "Task",
            fields: [],
          },
        ],
      },
    },
    isLoading: false,
  }),
  useGetJiraComponentsRestQuery: () => ({
    data: { components: [] },
    isLoading: false,
  }),
  useLinkJiraTaskMutation: () => [linkJiraTask, { isLoading: false }],
  useCreateJiraIssueMutation: () => [createJiraIssue, { isLoading: false }],
}));

vi.mock("react-redux", () => ({
  useDispatch: () => dispatch,
}));

function makeTask(): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Local follow up",
    description: "Local notes",
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
  };
}

function makeIssue(): JiraIssue {
  return {
    id: "10001",
    key: "EGS-123",
    summary: "Remote Jira summary",
    description: null,
    status: { id: "3", name: "In Progress", category: "indeterminate" },
    issueType: "Task",
    priority: "High",
    assignee: null,
    dueDate: null,
    components: [],
    updatedAt: "2026-09-11T09:00:00.000Z",
    browseUrl: "https://jira.example.test/browse/EGS-123",
    linkedTasks: [],
    editableFields: [],
  };
}

async function pressCmdL(target: Window | HTMLElement = window) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "l",
        metaKey: true,
        bubbles: true,
      }),
    );
  });
}

describe("LinkJiraPalette", () => {
  beforeEach(() => {
    jiraState.connected = true;
    jiraState.issues = [makeIssue()];
    jiraState.searchError = false;
    jiraState.isFetching = false;
    dispatch.mockReset();
    invalidateJiraIssues.mockReset();
    invalidateJiraIssues.mockReturnValue({ type: "invalidate" });
    linkJiraTask.mockReset();
    createJiraIssue.mockReset();
    linkJiraTask.mockReturnValue(mutationResult);
    createJiraIssue.mockReturnValue(mutationResult);
  });

  it("opens with Cmd+L for a selected task and links a searched issue", async () => {
    const user = userEvent.setup();

    render(<LinkJiraPalette selectedTask={makeTask()} selectedDate="2026-09-11" />);

    await pressCmdL();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search by key, URL, or text"), "EGS-123");
    await user.click(screen.getByRole("button", { name: "Link selected task to EGS-123" }));

    expect(linkJiraTask).toHaveBeenCalledWith({
      taskId: "11111111-1111-4111-8111-111111111111",
      issueIdOrKey: "EGS-123",
    });
    expect(invalidateJiraIssues).toHaveBeenCalledWith(["JiraIssue"]);
    expect(dispatch).toHaveBeenCalledWith({ type: "invalidate" });
  });

  it("keeps prior search hits visible while fetching", async () => {
    jiraState.isFetching = true;

    render(<LinkJiraPalette selectedTask={makeTask()} selectedDate="2026-09-11" />);

    await pressCmdL();

    expect(await screen.findByText("Remote Jira summary")).toBeInTheDocument();
    expect(screen.getByText("Searching Jira...")).toBeInTheDocument();
  });

  it("uses the same light Jira row treatment as the main pane", async () => {
    render(<LinkJiraPalette selectedTask={makeTask()} selectedDate="2026-09-11" />);

    await pressCmdL();

    expect(await screen.findByText("In Progress")).toBeInTheDocument();
    expect(screen.queryByText("Stage: In Progress")).not.toBeInTheDocument();
    expect(screen.getByText("Type: Task / Assignee: Unassigned / Due: No due date")).toBeInTheDocument();
    expect(screen.getByText("Remote Jira summary")).not.toHaveClass("font-semibold");
  });

  it("creates Jira issues with the rich wiki editor", async () => {
    const user = userEvent.setup();

    render(<LinkJiraPalette selectedTask={makeTask()} selectedDate="2026-09-11" />);

    await pressCmdL();
    await user.click(screen.getByRole("button", { name: "Create Jira issue" }));
    const descriptionField = screen.getByRole("textbox", {
      name: "New Jira description",
    });
    expect(descriptionField).toHaveValue("Local notes");
    await user.clear(descriptionField);
    await user.type(descriptionField, "Fresh notes");
    await user.click(screen.getByRole("button", { name: "Create and link" }));

    expect(createJiraIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Fresh notes",
      }),
    );
  });

  it("shows Jira search errors instead of an empty result", async () => {
    jiraState.issues = [];
    jiraState.searchError = true;

    render(<LinkJiraPalette selectedTask={makeTask()} selectedDate="2026-09-11" />);

    await pressCmdL();

    expect(await screen.findByText("Could not search Jira issues.")).toBeInTheDocument();
    expect(screen.queryByText("No Jira issues found.")).not.toBeInTheDocument();
  });

  it("does not open from Cmd+L while typing in another input", async () => {
    render(
      <>
        <input aria-label="Other input" />
        <LinkJiraPalette selectedTask={makeTask()} selectedDate="2026-09-11" />
      </>,
    );

    screen.getByLabelText("Other input").focus();
    await pressCmdL(screen.getByLabelText("Other input"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays closed without a selected task", async () => {
    render(<LinkJiraPalette selectedTask={null} selectedDate="2026-09-11" />);

    await pressCmdL();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
