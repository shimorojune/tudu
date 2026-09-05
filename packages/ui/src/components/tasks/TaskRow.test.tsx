import type { Task } from "@tudu/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskRow } from "./TaskRow";

const fixtureTask: Task = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Improve error message",
  scheduledDate: "2026-09-05",
  bucket: "now",
  position: 0,
  startDate: null,
  deadline: "2026-09-05T18:00:00.000Z",
  completedAt: null,
  carriedDays: 0,
  carriedSince: null,
  isPrivate: false,
  createdAt: "2026-09-05T08:00:00.000Z",
  updatedAt: "2026-09-05T08:00:00.000Z",
  subtasks: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      taskId: "11111111-1111-4111-8111-111111111111",
      title: "One",
      done: true,
      position: 0,
      createdAt: "2026-09-05T08:00:00.000Z",
      updatedAt: "2026-09-05T08:00:00.000Z",
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      taskId: "11111111-1111-4111-8111-111111111111",
      title: "Two",
      done: true,
      position: 1,
      createdAt: "2026-09-05T08:00:00.000Z",
      updatedAt: "2026-09-05T08:00:00.000Z",
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      taskId: "11111111-1111-4111-8111-111111111111",
      title: "Three",
      done: false,
      position: 2,
      createdAt: "2026-09-05T08:00:00.000Z",
      updatedAt: "2026-09-05T08:00:00.000Z",
    },
  ],
};

describe("TaskRow", () => {
  it("shows subtask progress in the meta line", () => {
    render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected={false}
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("applies selected row treatment", () => {
    const { container } = render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
      />,
    );

    expect(container.firstChild).toHaveClass("shadow-[inset_2px_0_0_var(--foreground)]");
    expect(screen.getByText("One")).toBeInTheDocument();
  });
});
