import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeStore } from "@tudu/store";
import { DEFAULT_MANAGER_PERMISSIONS, type InboxPendingItem, type Task } from "@tudu/shared";
import { ReportInboxRoute } from "./ReportInboxRoute";

const inboxState = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
  pending: [] as InboxPendingItem[],
  report: { id: "priya", name: "Priya Raman", email: "priya@egain.com" },
}));

vi.mock("@/hooks/useViewportBand", () => ({
  useViewportBand: () => "desktop",
}));

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ userId: "priya" }),
  useSearch: () => ({ send: false }),
  useNavigate: () => vi.fn(),
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

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useGetReportInboxQuery: () => ({
      data: inboxState.isLoading
        ? undefined
        : {
            report: inboxState.report,
            permissions: DEFAULT_MANAGER_PERMISSIONS,
            pending: inboxState.pending,
            history: [],
            count: inboxState.pending.length,
          },
      isLoading: inboxState.isLoading,
      isError: inboxState.isError,
    }),
    useGetTeamQuery: () => ({
      data: { reports: [], manager: null, outgoingInvites: [], incomingInvites: [] },
    }),
  };
});

vi.mock("@/components/team/SendInboxForm", () => ({
  SendInboxForm: ({ reportName }: { reportName: string }) => (
    <div>Send a task to {reportName.split(" ")[0]}</div>
  ),
}));

vi.mock("@/components/jira/JiraColumn", () => ({
  JiraColumn: ({
    selectedTask,
    reportUserId,
    reportName,
  }: {
    selectedTask: Task | null;
    selectedDate: string;
    reportUserId?: string;
    reportName?: string;
  }) => (
    <div>
      Jira inbox for {reportName} / {reportUserId} /{" "}
      {selectedTask?.title ?? "none"}
    </div>
  ),
}));

vi.mock("@/components/loading/InboxSkeleton", () => ({
  InboxSkeleton: ({ withJiraPane }: { withJiraPane?: boolean }) => (
    <div>Inbox skeleton with Jira pane {withJiraPane ? "yes" : "no"}</div>
  ),
}));

describe("ReportInboxRoute", () => {
  beforeEach(() => {
    inboxState.isLoading = false;
    inboxState.isError = false;
    inboxState.pending = [];
  });

  it("shows a waiting card without accept or decline", () => {
    inboxState.pending = [
      {
        id: "55555555-5555-4555-8555-555555555555",
        kind: "assigned",
        from: { id: "marcus", name: "Marcus Bell", email: "marcus@egain.com" },
        task: {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Review the brief",
          description: "Check the latest draft",
          scheduledDate: null,
          bucket: null,
          position: 0,
          startDate: "2026-09-14",
          deadline: null,
          completedAt: null,
          inProgress: false,
          carriedDays: 0,
          carriedSince: null,
          isPrivate: false,
          createdAt: "2026-09-10T08:00:00.000Z",
          updatedAt: "2026-09-10T08:00:00.000Z",
          commentCount: 0,
          project: null,
          jiraLinks: [],
          subtasks: [],
        },
        declineReason: null,
        createdAt: "2026-09-10T08:00:00.000Z",
      },
    ];

    render(
      <Provider store={makeStore()}>
        <ReportInboxRoute />
      </Provider>,
    );

    expect(screen.getByText("Priya Raman")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByText("Review the brief")).toBeInTheDocument();
    expect(screen.getByText("Check the latest draft")).toBeInTheDocument();
    expect(screen.getByText("waiting for them to accept")).toBeInTheDocument();
    expect(screen.getByText("Send a task to Priya")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Decline/ })).not.toBeInTheDocument();
  });

  it("renders the manager Jira column for the report inbox", () => {
    render(
      <Provider store={makeStore()}>
        <ReportInboxRoute />
      </Provider>,
    );

    expect(screen.getByText("Priya Raman")).toBeInTheDocument();
    expect(
      screen.getByText("Jira inbox for Priya Raman / priya / none"),
    ).toBeInTheDocument();
  });

  it("shows an empty waiting list while the send form stays", () => {
    render(
      <Provider store={makeStore()}>
        <ReportInboxRoute />
      </Provider>,
    );

    expect(screen.getByText("Nothing waiting")).toBeInTheDocument();
    expect(screen.getByText("Send a task to Priya")).toBeInTheDocument();
  });

  it("keeps the Jira pane reserved while loading the report inbox", () => {
    inboxState.isLoading = true;

    render(
      <Provider store={makeStore()}>
        <ReportInboxRoute />
      </Provider>,
    );

    expect(screen.getByText("Inbox skeleton with Jira pane yes")).toBeInTheDocument();
  });
});
