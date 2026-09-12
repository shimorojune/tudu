import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "@tudu/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportWeekRoute } from "./ReportWeekRoute";

const weekQuery = vi.hoisted(() => ({ isLoading: false, isError: false }));

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ userId: "priya" }),
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
  useRouterState: (opts?: {
    select?: (state: {
      location: { search: Record<string, unknown>; searchStr: string };
    }) => unknown;
  }) => {
    const snapshot = { location: { search: {}, searchStr: "" } };
    return opts?.select ? opts.select(snapshot) : snapshot;
  },
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

vi.mock("@/hooks/useProjectFilterId", () => ({
  useProjectFilterId: () => undefined,
}));

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useReorderTasksMutation: () => [vi.fn()],
    useReorderReportTasksMutation: () => [vi.fn()],
  };
});

vi.mock("@/hooks/useReportWeekTaskQueries", () => ({
  useReportWeekTaskQueries: () => ({
    unscheduledQuery: { data: { tasks: [] } },
    dayQueries: [
      {
        data: {
          report: { id: "priya", name: "Priya Raman", email: "priya@egain.com" },
          date: "2026-09-07",
          tasks: [],
          slippingCount: 0,
        },
      },
    ],
    tasksByDay: new Map(),
    isLoading: weekQuery.isLoading,
    isError: weekQuery.isError,
  }),
}));

describe("ReportWeekRoute", () => {
  beforeEach(() => {
    weekQuery.isLoading = false;
    weekQuery.isError = false;
  });

  it("renders the report week grid with a day week switch", () => {
    render(
      <Provider store={makeStore()}>
        <ReportWeekRoute />
      </Provider>,
    );

    expect(screen.getByText("Priya Raman")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Day" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Week" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send a task" })).toBeInTheDocument();
    expect(screen.getAllByText("Unscheduled").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Private tasks are hidden from this view"),
    ).toBeInTheDocument();
  });

  it("keeps the person header while the report week loads", () => {
    weekQuery.isLoading = true;

    render(
      <Provider store={makeStore()}>
        <ReportWeekRoute />
      </Provider>,
    );

    expect(screen.getByText("Priya Raman")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Week" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });
});
