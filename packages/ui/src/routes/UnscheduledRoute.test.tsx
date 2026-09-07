import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnscheduledRoute } from "./UnscheduledRoute";

vi.mock("@tudu/store", () => ({
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
}));

vi.mock("@/hooks/useNewTaskShortcut", () => ({
  useNewTaskShortcut: () => undefined,
}));

describe("UnscheduledRoute", () => {
  it("renders the empty unscheduled list", () => {
    render(<UnscheduledRoute />);

    expect(screen.getByText("Unscheduled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
  });
});
