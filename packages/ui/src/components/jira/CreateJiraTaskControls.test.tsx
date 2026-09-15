import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JiraIssue } from "@tudu/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SendJiraInboxDialog,
  SpawnJiraTaskDialog,
} from "./CreateJiraTaskControls";

const spawnJiraTask = vi.hoisted(() => vi.fn());
const spawnReportJiraTask = vi.hoisted(() => vi.fn());
const createSubtask = vi.hoisted(() => vi.fn());
const invalidateTags = vi.hoisted(() => vi.fn());
const dispatch = vi.hoisted(() => vi.fn());
const mutationResult = vi.hoisted(() => ({
  unwrap: () =>
    Promise.resolve({ task: { id: "33333333-3333-4333-8333-333333333333" } }),
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
    todayIso: () => "2026-09-11",
    jiraApi: {
      util: {
        invalidateTags,
      },
    },
    useGetProjectsQuery: () => ({ data: [], isLoading: false }),
    useCreateProjectMutation: () => [vi.fn(), { isLoading: false }],
    useSpawnJiraTaskMutation: () => [spawnJiraTask, { isLoading: false }],
    useSpawnReportJiraTaskMutation: () => [spawnReportJiraTask, { isLoading: false }],
    useCreateSubtaskMutation: () => [createSubtask, { isLoading: false }],
  };
});

function makeIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    id: "10001",
    key: "EGS-123",
    summary: "Remote Jira summary",
    description: "Remote description",
    status: { id: "3", name: "In Progress", category: "indeterminate" },
    issueType: "Bug",
    priority: "High",
    assignee: null,
    dueDate: "2026-09-12",
    components: [],
    updatedAt: "2026-09-11T09:00:00.000Z",
    browseUrl: "https://jira.example.test/browse/EGS-123",
    linkedTasks: [],
    editableFields: [],
    ...overrides,
  };
}

describe("SpawnJiraTaskDialog", () => {
  beforeEach(() => {
    spawnJiraTask.mockReset();
    createSubtask.mockReset();
    spawnJiraTask.mockReturnValue(mutationResult);
    createSubtask.mockReturnValue(mutationResult);
  });

  it("opens the new task dialog prefilled and spawns a linked task", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(
      <SpawnJiraTaskDialog
        issue={makeIssue()}
        selectedDate="2026-09-11"
        nowCount={0}
        onOpenChange={vi.fn()}
        onCreated={onCreated}
      />,
    );

    expect(screen.getByPlaceholderText("What needs doing?")).toHaveValue(
      "Remote Jira summary",
    );
    expect(screen.getByRole("textbox", { name: "Task description" })).toHaveValue(
      "Remote description",
    );

    await user.click(screen.getByRole("button", { name: /Add to Later/i }));

    expect(spawnJiraTask).toHaveBeenCalledWith({
      issueId: "10001",
      title: "Remote Jira summary",
      description: "Remote description",
      scheduledDate: "2026-09-11",
      bucket: "later",
      startDate: null,
      deadline: "2026-09-12T18:00:00.000Z",
      projectId: null,
    });
    expect(onCreated).toHaveBeenCalledWith({
      id: "33333333-3333-4333-8333-333333333333",
      scheduledDate: "2026-09-11",
    });
  });
});

describe("SendJiraInboxDialog", () => {
  beforeEach(() => {
    spawnReportJiraTask.mockReset();
    invalidateTags.mockReset();
    dispatch.mockReset();
    invalidateTags.mockReturnValue({ type: "invalidate" });
    spawnReportJiraTask.mockReturnValue(mutationResult);
  });

  it("sends a linked report task to inbox", async () => {
    const user = userEvent.setup();
    const onSent = vi.fn();
    render(
      <SendJiraInboxDialog
        issue={makeIssue({ description: null })}
        reportUserId="priya"
        reportName="Priya Raman"
        onOpenChange={vi.fn()}
        onSent={onSent}
      />,
    );

    expect(screen.getByLabelText("New task title")).toHaveValue("Remote Jira summary");
    await user.click(screen.getByRole("button", { name: "Send to inbox" }));

    expect(spawnReportJiraTask).toHaveBeenCalledWith({
      issueId: "10001",
      title: "Remote Jira summary",
      description: null,
      scheduledDate: null,
      bucket: null,
      startDate: null,
      deadline: "2026-09-12T18:00:00.000Z",
      projectId: null,
      reportUserId: "priya",
    });
    expect(invalidateTags).toHaveBeenCalledWith(["JiraIssue"]);
    expect(onSent).toHaveBeenCalled();
  });
});
