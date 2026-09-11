import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "@tudu/store";
import { describe, expect, it, vi } from "vitest";
import { WeekRoute } from "./WeekRoute";

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({}),
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
    isLoading: false,
    isError: false,
  }),
}));

describe("WeekRoute", () => {
  it("renders the week grid shell", () => {
    render(
      <Provider store={makeStore()}>
        <WeekRoute />
      </Provider>,
    );

    expect(screen.getByText("Unscheduled")).toBeInTheDocument();
    expect(
      screen.getByText("Undated tasks live in the left rail. Drag one onto a day."),
    ).toBeInTheDocument();
  });
});
