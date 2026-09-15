import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "@tudu/store";
import { describe, expect, it, vi } from "vitest";
import { UnscheduledRoute } from "./UnscheduledRoute";

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    todayIso: () => "2026-09-07",
    useGetUnscheduledTasksQuery: () => ({
      data: { tasks: [] },
      isLoading: false,
      isError: false,
    }),
    useGetTasksForDayQuery: () => ({ data: { tasks: [] } }),
    useCreateTaskMutation: () => [vi.fn()],
    useUpdateTaskMutation: () => [vi.fn()],
    useDeleteTaskMutation: () => [vi.fn()],
    useDeleteSubtaskMutation: () => [vi.fn()],
    useReorderTasksMutation: () => [vi.fn()],
    useReorderSubtasksMutation: () => [vi.fn()],
    useCreateSubtaskMutation: () => [vi.fn()],
    useUpdateSubtaskMutation: () => [vi.fn()],
  };
});

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
  useRouterState: (opts?: {
    select?: (state: {
      location: { search: Record<string, unknown>; searchStr: string };
    }) => unknown;
  }) => {
    const snapshot = {
      location: { pathname: "/unscheduled", search: {}, searchStr: "" },
    };
    return opts?.select ? opts.select(snapshot) : snapshot;
  },
}));

vi.mock("@/hooks/useNewTaskShortcut", () => ({
  useNewTaskShortcut: () => undefined,
}));

vi.mock("@/hooks/useProjectFilterId", () => ({
  useProjectFilterId: () => undefined,
}));

describe("UnscheduledRoute", () => {
  it("renders the empty unscheduled list", () => {
    render(
      <Provider store={makeStore()}>
        <UnscheduledRoute />
      </Provider>,
    );

    expect(screen.getByText("Unscheduled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
  });
});
