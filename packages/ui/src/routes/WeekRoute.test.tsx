import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "@tudu/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WeekRoute } from "./WeekRoute";

const weekQuery = vi.hoisted(() => ({ isLoading: false }));

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({}),
  useRouterState: (opts?: {
    select?: (state: { location: { search: Record<string, unknown> } }) => unknown;
  }) => {
    const snapshot = { location: { search: {} } };
    return opts?.select ? opts.select(snapshot) : snapshot;
  },
}));

vi.mock("@/hooks/useProjectFilterId", () => ({
  useProjectFilterId: () => undefined,
}));

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    todayIso: () => "2026-09-07",
    useCreateSubtaskMutation: () => [vi.fn()],
    useCreateTaskMutation: () => [vi.fn()],
    useGetTasksForDayQuery: () => ({
      data: { tasks: [] },
      isLoading: false,
      isError: false,
    }),
    useReorderTasksMutation: () => [vi.fn()],
  };
});

vi.mock("@/hooks/useNewTaskShortcut", () => ({
  useNewTaskShortcut: () => undefined,
}));

vi.mock("@/hooks/useWeekTaskQueries", () => ({
  useWeekTaskQueries: () => ({
    unscheduledQuery: { data: { tasks: [] } },
    tasksByDay: new Map(),
    isLoading: weekQuery.isLoading,
    isError: false,
  }),
}));

describe("WeekRoute", () => {
  beforeEach(() => {
    weekQuery.isLoading = false;
  });

  it("renders the week grid shell", () => {
    render(
      <Provider store={makeStore()}>
        <WeekRoute />
      </Provider>,
    );

    expect(screen.getAllByText("Unscheduled").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Undated tasks live in the left rail. Drag one onto a day."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Jump to Unscheduled" }),
    ).toBeInTheDocument();
  });

  it("shows a skeleton while week tasks load", () => {
    weekQuery.isLoading = true;

    render(
      <Provider store={makeStore()}>
        <WeekRoute />
      </Provider>,
    );

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Undated tasks live in the left rail. Drag one onto a day."),
    ).not.toBeInTheDocument();
  });
});
