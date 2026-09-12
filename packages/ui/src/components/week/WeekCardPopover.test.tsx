import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "@tudu/shared";
import { WeekCardPopover } from "./WeekCardPopover";
import { SortableWeekCard } from "./SortableWeekCard";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@tudu/store", () => ({
  useDeleteTaskMutation: () => [vi.fn()],
  useDeleteReportTaskMutation: () => [vi.fn()],
  useReorderTasksMutation: () => [vi.fn()],
  useReorderReportTasksMutation: () => [vi.fn()],
  useUpdateTaskMutation: () => [vi.fn()],
  setSelectedDate: vi.fn(),
  setSelectedTaskId: vi.fn(),
  todayIso: () => "2026-09-12",
}));

vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
}));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => undefined,
    isDragging: false,
  }),
  SortableContext: ({ children }: { children: ReactNode }) => children,
}));

const task: Task = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Thursday task",
  description: null,
  scheduledDate: "2026-09-10",
  bucket: "later",
  position: 0,
  startDate: null,
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
  subtasks: [],
};

describe("WeekCardPopover", () => {
  it("opens when the card is clicked", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <DndContext>
          <SortableContext items={[task.id]}>
            <WeekCardPopover
              task={task}
              scheduledDate="2026-09-10"
              isToday={false}
              dayTasks={[task]}
              open={open}
              onOpenChange={setOpen}
            >
              <SortableWeekCard
                task={task}
                scheduledDate="2026-09-10"
                isToday={false}
              />
            </WeekCardPopover>
          </SortableContext>
        </DndContext>
      );
    }

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /Thursday task/i }));

    expect(await screen.findByRole("button", { name: "Open day" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\(current\)/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Move to Priority 3" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to Priority 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to Priority 2" })).toBeInTheDocument();
  });

  it("hides complete for a manager and opens the report day", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <DndContext>
          <SortableContext items={[task.id]}>
            <WeekCardPopover
              task={task}
              scheduledDate="2026-09-10"
              isToday={false}
              dayTasks={[task]}
              open={open}
              onOpenChange={setOpen}
              viewer="manager"
              reportUserId="priya"
            >
              <SortableWeekCard
                task={task}
                scheduledDate="2026-09-10"
                isToday={false}
              />
            </WeekCardPopover>
          </SortableContext>
        </DndContext>
      );
    }

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /Thursday task/i }));

    expect(await screen.findByRole("button", { name: "Open day" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark complete" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark in progress" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open day" }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/team/$userId",
      params: { userId: "priya" },
      search: {
        send: false,
        date: "2026-09-10",
        task: task.id,
      },
    });
  });
});
