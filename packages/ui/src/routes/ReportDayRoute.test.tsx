import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { DEFAULT_MANAGER_PERMISSIONS, type Task } from "@tudu/shared";
import { makeStore, setSelectedDate, setSelectedTaskId } from "@tudu/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportDayRoute } from "./ReportDayRoute";

const reportDayState = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
}));
const navigate = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useViewportBand", () => ({
  useViewportBand: () => "desktop",
}));

vi.mock("@/hooks/useDaySearchSync", () => ({
  useDaySearchSync: () => {},
}));

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ userId: "priya" }),
  useSearch: () => ({ send: false }),
  useNavigate: () => navigate,
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/tasks/DayTaskList", () => ({
  DayTaskList: ({ tasks }: { tasks: Task[] }) => (
    <div>{tasks.map((task) => task.title).join(", ")}</div>
  ),
}));

vi.mock("@/components/inspector/DetailInspector", () => ({
  DetailInspector: ({ task }: { task: Task | null }) => (
    <div>Inspector for {task?.title ?? "none"}</div>
  ),
}));

vi.mock("@/components/team/SendInboxForm", () => ({
  SendInboxForm: ({ reportName }: { reportName: string }) => (
    <div>Send a task to {reportName.split(" ")[0]}</div>
  ),
}));

vi.mock("@/components/jira/JiraColumn", () => ({
  JiraColumn: ({
    selectedTask,
    selectedDate,
    reportUserId,
    reportName,
    reportPermissions,
  }: {
    selectedTask: Task | null;
    selectedDate: string;
    reportUserId?: string;
    reportName?: string;
    reportPermissions?: typeof DEFAULT_MANAGER_PERMISSIONS;
  }) => (
    <div>
      Jira for {reportName} / {reportUserId} / {selectedDate} /{" "}
      {selectedTask?.title ?? "none"} / can send{" "}
      {reportPermissions?.canSendInbox ? "yes" : "no"}
    </div>
  ),
}));

function makeTask(): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Report follow up",
    description: null,
    scheduledDate: "2026-09-13",
    bucket: "now",
    position: 0,
    startDate: null,
    deadline: null,
    completedAt: null,
    inProgress: false,
    carriedDays: 0,
    carriedSince: null,
    isPrivate: false,
    createdAt: "2026-09-13T08:00:00.000Z",
    updatedAt: "2026-09-13T08:00:00.000Z",
    commentCount: 0,
    project: null,
    jiraLinks: [],
    subtasks: [],
  };
}

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    todayIso: () => "2026-09-13",
    useGetReportDayQuery: () => ({
      data: {
        report: { id: "priya", name: "Priya Raman", email: "priya@egain.com" },
        permissions: DEFAULT_MANAGER_PERMISSIONS,
        date: "2026-09-13",
        tasks: [makeTask()],
        slippingCount: 0,
      },
      isLoading: reportDayState.isLoading,
      isError: reportDayState.isError,
    }),
  };
});

describe("ReportDayRoute", () => {
  beforeEach(() => {
    reportDayState.isLoading = false;
    reportDayState.isError = false;
    navigate.mockReset();
  });

  it("renders the manager Jira column for the report day", () => {
    const store = makeStore();
    store.dispatch(setSelectedDate("2026-09-13"));
    store.dispatch(setSelectedTaskId("11111111-1111-4111-8111-111111111111"));

    render(
      <Provider store={store}>
        <ReportDayRoute />
      </Provider>,
    );

    expect(screen.getByText("Priya Raman")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Jira for Priya Raman / priya / 2026-09-13 / Report follow up / can send yes",
      ),
    ).toBeInTheDocument();
  });
});
