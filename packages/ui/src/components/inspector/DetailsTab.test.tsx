import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@tudu/shared";
import { DetailsTab } from "./DetailsTab";

const dispatch = vi.hoisted(() => vi.fn());
const invalidateTags = vi.hoisted(() => vi.fn());
const unlinkJiraTask = vi.hoisted(() => vi.fn());

vi.mock("@tudu/store", () => ({
  todayIso: () => "2026-09-11",
  jiraApi: {
    util: {
      invalidateTags,
    },
  },
  useGetMeQuery: () => ({ data: { id: "user-1", name: "You" } }),
  useUpdateTaskMutation: () => [vi.fn()],
  useUploadTaskAttachmentMutation: () => [vi.fn()],
  useUnlinkJiraTaskMutation: () => [unlinkJiraTask],
  useGetProjectsQuery: () => ({ data: [], isLoading: false }),
  useCreateProjectMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("react-redux", () => ({
  useDispatch: () => dispatch,
}));

vi.mock("@/hooks/useProjectSpaceScope", () => ({
  useProjectSpaceScope: () => ({ kind: "personal" as const }),
}));

const task: Task = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ship it",
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
  project: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "EGS",
    color: "vermilion",
    archivedAt: null,
    isPrivate: false,
  },
  jiraLinks: [],
  subtasks: [],
};

describe("DetailsTab", () => {
  beforeEach(() => {
    dispatch.mockReset();
    invalidateTags.mockReset();
    invalidateTags.mockReturnValue({ type: "invalidate" });
    unlinkJiraTask.mockReset();
    unlinkJiraTask.mockReturnValue({
      unwrap: () => Promise.resolve({}),
    });
  });

  it("shows a project picker", () => {
    render(
      <DetailsTab
        task={task}
        selectedDate="2026-09-11"
        isToday
        timelineEvents={[]}
        onJumpToTimeline={vi.fn()}
      />,
    );

    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Project" })).toBeInTheDocument();
  });

  it("shows linked Jira issue metadata without replacing the task title", () => {
    render(
      <DetailsTab
        task={{
          ...task,
          title: "Local action title",
          jiraLinks: [
            {
              issueId: "10001",
              key: "EGS-123",
              summary: "Remote Jira summary",
              statusName: "In Progress",
              dueDate: "2026-09-12",
              browseUrl: "https://jira.example.test/browse/EGS-123",
            },
          ],
        }}
        selectedDate="2026-09-11"
        isToday
        timelineEvents={[]}
        onJumpToTimeline={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Local action title" })).toBeInTheDocument();
    expect(screen.getByText("Remote Jira summary")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open EGS-123 in Jira" })).toHaveAttribute(
      "href",
      "https://jira.example.test/browse/EGS-123",
    );
  });

  it("refreshes Jira REST caches after unlinking from the inspector", async () => {
    const user = userEvent.setup();
    render(
      <DetailsTab
        task={{
          ...task,
          jiraLinks: [
            {
              issueId: "10001",
              key: "EGS-123",
              summary: "Remote Jira summary",
              statusName: "In Progress",
              dueDate: "2026-09-12",
              browseUrl: "https://jira.example.test/browse/EGS-123",
            },
          ],
        }}
        selectedDate="2026-09-11"
        isToday
        timelineEvents={[]}
        onJumpToTimeline={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Unlink" }));

    expect(unlinkJiraTask).toHaveBeenCalledWith({
      taskId: "11111111-1111-4111-8111-111111111111",
      issueIdOrKey: "EGS-123",
    });
    expect(invalidateTags).toHaveBeenCalledWith(["JiraIssue"]);
    expect(dispatch).toHaveBeenCalledWith({ type: "invalidate" });
  });

  it("shows a delete task control when allowed", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();

    render(
      <DetailsTab
        task={task}
        selectedDate="2026-09-11"
        isToday
        timelineEvents={[]}
        onJumpToTimeline={vi.fn()}
        canDelete
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete task" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalled();
  });

  it("shows an inline error when inspector Jira unlink fails", async () => {
    const user = userEvent.setup();
    unlinkJiraTask.mockReturnValue({
      unwrap: () =>
        Promise.reject({ data: { error: "Jira link not found" } }),
    });

    render(
      <DetailsTab
        task={{
          ...task,
          jiraLinks: [
            {
              issueId: "10001",
              key: "EGS-123",
              summary: "Remote Jira summary",
              statusName: "In Progress",
              dueDate: "2026-09-12",
              browseUrl: "https://jira.example.test/browse/EGS-123",
            },
          ],
        }}
        selectedDate="2026-09-11"
        isToday
        timelineEvents={[]}
        onJumpToTimeline={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Unlink" }));

    expect(await screen.findByText("Jira link not found")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
