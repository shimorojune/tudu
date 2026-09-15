import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import type { JiraIssue, Task } from "@tudu/shared";
import { makeStore, setSelectedDate } from "@tudu/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TodayRoute } from "./TodayRoute";

const dayState = vi.hoisted(() => ({
  tasks: [] as Task[],
  dayLoading: false,
  dayError: false,
  unscheduledTasks: [] as Task[],
  unscheduledLoading: false,
}));
const createTask = vi.hoisted(() => vi.fn());
const createSubtask = vi.hoisted(() => vi.fn());
const spawnJiraTask = vi.hoisted(() => vi.fn());
const mutationResult = vi.hoisted(() => ({
  unwrap: () =>
    Promise.resolve({
      task: {
        id: "11111111-1111-4111-8111-111111111111",
      },
    }),
}));

vi.mock("@tudu/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/shared")>();
  return {
    ...actual,
    effectiveDayIso: () => "2026-09-13",
  };
});

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useGetTasksForDayQuery: () => ({
      data: { tasks: dayState.tasks },
      isLoading: dayState.dayLoading,
      isError: dayState.dayError,
    }),
    useGetUnscheduledTasksQuery: () => ({
      data: { tasks: dayState.unscheduledTasks },
      isLoading: dayState.unscheduledLoading,
      isError: false,
    }),
    useCreateTaskMutation: () => [createTask, { isLoading: false }],
    useCreateSubtaskMutation: () => [createSubtask, { isLoading: false }],
    useSpawnJiraTaskMutation: () => [spawnJiraTask, { isLoading: false }],
    useGetProjectsQuery: () => ({ data: [], isLoading: false }),
    useCreateProjectMutation: () => [vi.fn(), { isLoading: false }],
  };
});

vi.mock("@/hooks/useViewportBand", () => ({
  useViewportBand: () => "desktop",
}));

vi.mock("@/hooks/useDaySearchSync", () => ({
  useDaySearchSync: () => {},
}));

vi.mock("@/hooks/useNewTaskShortcut", () => ({
  useNewTaskShortcut: () => {},
}));

vi.mock("@/hooks/useRolloverOnFocus", () => ({
  useRolloverOnFocus: () => ({ maybeRollover: vi.fn() }),
}));

vi.mock("@/components/today/MidnightBanner", () => ({
  MidnightBanner: () => null,
}));

vi.mock("@/components/jira/JiraColumn", () => ({
  JiraColumn: ({
    selectedTask,
    selectedDate,
    onCreateTask,
  }: {
    selectedTask: Task | null;
    selectedDate: string;
    onCreateTask?: (issue: JiraIssue) => void;
  }) => (
    <div>
      Jira pane {selectedDate} {selectedTask?.title ?? "none"}
      <button
        type="button"
        onClick={() =>
          onCreateTask?.({
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
          })
        }
      >
        Create task from Jira
      </button>
    </div>
  ),
}));

vi.mock("@/components/inspector/DetailInspector", () => ({
  DetailInspector: ({ task }: { task: Task | null }) => (
    <div>Inspector pane {task?.title ?? "none"}</div>
  ),
}));

vi.mock("@/components/jira/LinkJiraPalette", () => ({
  LinkJiraPalette: () => null,
}));

describe("TodayRoute", () => {
  beforeEach(() => {
    dayState.tasks = [];
    dayState.dayLoading = false;
    dayState.dayError = false;
    dayState.unscheduledTasks = [];
    dayState.unscheduledLoading = false;
    createTask.mockReset();
    createSubtask.mockReset();
    spawnJiraTask.mockReset();
    createTask.mockReturnValue(mutationResult);
    createSubtask.mockReturnValue(mutationResult);
    spawnJiraTask.mockReturnValue(mutationResult);
  });

  it("keeps the desktop first-run screen inside the three-pane Today layout", () => {
    const store = makeStore();
    store.dispatch(setSelectedDate("2026-09-13"));

    render(
      <Provider store={store}>
        <TodayRoute />
      </Provider>,
    );

    expect(screen.getByText("Nothing here yet. Good.")).toBeInTheDocument();
    expect(screen.getByText(/press Cmd\+L/i)).toBeInTheDocument();
    expect(screen.getByText("Jira pane 2026-09-13 none")).toBeInTheDocument();
    expect(screen.getByText("Inspector pane none")).toBeInTheDocument();
  });

  it("opens New task from Jira with the issue title filled", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.dispatch(setSelectedDate("2026-09-13"));

    render(
      <Provider store={store}>
        <TodayRoute />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: "Create task from Jira" }));

    expect(screen.getByPlaceholderText("What needs doing?")).toHaveValue(
      "Remote Jira summary",
    );
    expect(screen.getByLabelText("Task description")).toHaveValue("Remote description");
  });
});
