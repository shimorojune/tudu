import type { ReactNode } from "react";
import type { Task } from "@tudu/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskRow, type TaskRowActions } from "./TaskRow";

const sortableState = vi.hoisted(() => ({
  isDragging: false,
}));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: sortableState.isDragging,
    transform: null,
    transition: undefined,
  }),
  SortableContext: ({ children }: { children: ReactNode }) => children,
  verticalListSortingStrategy: () => null,
  arrayMove: (items: string[], from: number, to: number) => {
    const next = [...items];
    const [removed] = next.splice(from, 1);
    next.splice(to, 0, removed!);
    return next;
  },
}));

function defaultActions(overrides: Partial<TaskRowActions> = {}): TaskRowActions {
  return {
    onComplete: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onToggleSubtask: vi.fn(),
    onRenameSubtask: vi.fn(),
    onAddSubtask: vi.fn(),
    onReorderSubtasks: vi.fn(),
    ...overrides,
  };
}

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
  commentCount: 0,
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
  afterEach(() => {
    sortableState.isDragging = false;
  });

  it("shows subtask progress in the meta line", () => {
    render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected={false}
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
      />,
    );

    expect(screen.getByText("2 of 3 completed")).toBeInTheDocument();
  });

  it("applies selected row treatment without shifting horizontal padding", () => {
    const { container } = render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
      />,
    );

    const row = container.querySelector('[role="button"]');
    expect(row).toHaveClass("px-[28px]");
    expect(row).not.toHaveClass("pl-[13px]");
    expect(row).toHaveClass("before:bg-foreground");
    expect(screen.getByText("One")).toBeInTheDocument();
  });

  it("animates the subtask panel open and closed", () => {
    const { container, rerender } = render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected={false}
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
      />,
    );

    const panel = container.querySelector(".grid.transition-\\[grid-template-rows\\]");
    expect(panel).toHaveClass("grid-rows-[0fr]");

    rerender(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
      />,
    );

    expect(panel).toHaveClass("grid-rows-[1fr]");
  });

  it("renders a compact faint slot while dragging", () => {
    sortableState.isDragging = true;

    const { container } = render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
      />,
    );

    const row = container.querySelector('[role="button"]');
    expect(row).toHaveClass("bg-foreground/[0.04]");
    expect(row).toHaveClass("[&>*]:invisible");
    expect(row?.getAttribute("style") ?? "").not.toContain("opacity: 0");
    expect(screen.getByText("Improve error message")).toBeInTheDocument();

    const panel = container.querySelector(".grid.transition-\\[grid-template-rows\\]");
    expect(panel).toHaveClass("grid-rows-[0fr]");
    expect(panel).not.toHaveClass("grid-rows-[1fr]");
  });

  it("allows spaces in the subtask input", async () => {
    const user = userEvent.setup();

    render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
        actions={defaultActions()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add a subtask" }));
    const input = screen.getByPlaceholderText("Subtask title");
    await user.type(input, "fix the bug");
    expect(input).toHaveValue("fix the bug");
  });

  it("always renders the drag handle column", () => {
    const { container } = render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected={false}
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
      />,
    );

    expect(container.firstChild).toHaveClass(
      "grid-cols-[13px_19px_minmax(0,1fr)_auto]",
    );
  });

  it("shows a strike bar on completed tasks", () => {
    const { container } = render(
      <TaskRow
        task={{ ...fixtureTask, completedAt: "2026-09-05T12:00:00.000Z" }}
        bucket="now"
        selected={false}
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
      />,
    );

    const strike = container.querySelector('[aria-hidden="true"].scale-x-100');
    expect(strike).toBeInTheDocument();
    expect(screen.getByText("Improve error message")).toHaveClass("text-faint");
    expect(screen.getByText("Improve error message")).not.toHaveClass("line-through");
  });

  it("uses the same strike bar on completed subtasks", () => {
    const { container } = render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
      />,
    );

    const title = screen.getByText("One");
    expect(title).toHaveClass("text-faint");
    expect(title).not.toHaveClass("line-through");
    expect(title.parentElement?.querySelector(".scale-x-100")).toBeInTheDocument();
  });

  it("hides the strike bar on incomplete tasks", () => {
    const { container } = render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected={false}
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
      />,
    );

    const strike = container.querySelector('[aria-hidden="true"].scale-x-0');
    expect(strike).toBeInTheDocument();
  });

  it("calls onComplete when the checkbox is clicked", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();

    render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected={false}
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
        actions={defaultActions({ onComplete })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mark complete" }));
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  it("renames a subtask on click", async () => {
    const onRenameSubtask = vi.fn();
    const user = userEvent.setup();

    render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
        actions={defaultActions({ onRenameSubtask })}
      />,
    );

    await user.click(screen.getByText("Three"));
    const editor = screen.getByRole("textbox", { name: "Rename subtask" });
    await user.tripleClick(editor);
    await user.keyboard("Renamed{Enter}");
    expect(onRenameSubtask).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      "Renamed",
    );
  });

  it("renames the main task title on click when selected", async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();

    render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
        actions={defaultActions({ onRename })}
      />,
    );

    await user.click(screen.getByText("Improve error message"));
    const editor = screen.getByRole("textbox", { name: "Rename task" });
    await user.tripleClick(editor);
    await user.keyboard("Updated title{Enter}");
    expect(onRename).toHaveBeenCalledWith("Updated title");
  });

  it("reverts the main task title on Escape without calling onRename", async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();

    render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
        actions={defaultActions({ onRename })}
      />,
    );

    await user.click(screen.getByText("Improve error message"));
    const editor = screen.getByRole("textbox", { name: "Rename task" });
    await user.tripleClick(editor);
    await user.keyboard("Changed mind{Escape}");
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Improve error message")).toBeInTheDocument();
  });

  it("does not edit the main task title when the row is not selected", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected={false}
        selectedDate="2026-09-05"
        onSelect={onSelect}
        menuVariant="day"
        actions={defaultActions()}
      />,
    );

    await user.click(screen.getByText("Improve error message"));
    expect(screen.queryByRole("textbox", { name: "Rename task" })).not.toBeInTheDocument();
    expect(onSelect).toHaveBeenCalled();
  });

  it("keeps the new subtask title in the list after Enter", async () => {
    const onAddSubtask = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
        actions={defaultActions({ onAddSubtask })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add a subtask" }));
    await user.type(screen.getByPlaceholderText("Subtask title"), "fix the bug{Enter}");
    expect(onAddSubtask).toHaveBeenCalledWith("fix the bug");
    expect(screen.getByText("fix the bug")).toBeInTheDocument();

    rerender(
      <TaskRow
        task={{
          ...fixtureTask,
          subtasks: [
            ...fixtureTask.subtasks,
            {
              id: "55555555-5555-4555-8555-555555555555",
              taskId: fixtureTask.id,
              title: "fix the bug",
              done: false,
              position: 3,
              createdAt: "2026-09-05T08:00:00.000Z",
              updatedAt: "2026-09-05T08:00:00.000Z",
            },
          ],
        }}
        bucket="now"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
        actions={defaultActions({ onAddSubtask })}
      />,
    );

    expect(screen.getByText("fix the bug")).toBeInTheDocument();
  });

  it("scrolls into view and flashes when flash is true", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const { container, rerender } = render(
      <TaskRow
        task={fixtureTask}
        bucket="later"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
        flash={false}
      />,
    );

    rerender(
      <TaskRow
        task={fixtureTask}
        bucket="later"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
        flash
      />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth",
    });
    expect(container.querySelector('[role="button"]')).toHaveClass("add-task-flash");
  });

  it("reserves subtask drag handle space without shifting checkbox layout", () => {
    const { container } = render(
      <TaskRow
        task={fixtureTask}
        bucket="now"
        selected
        selectedDate="2026-09-05"
        onSelect={vi.fn()}
        menuVariant="day"
        actions={defaultActions()}
      />,
    );

    const clipper = container.querySelector(".-ml-\\[20px\\]");
    expect(clipper).toBeInTheDocument();
    expect(clipper).toHaveClass("pl-[20px]");

    const handles = container.querySelectorAll("[data-subtask-drag-handle]");
    expect(handles.length).toBe(fixtureTask.subtasks.length);
    for (const handle of handles) {
      expect(handle).toHaveClass("opacity-0");
      expect(handle).toHaveClass("left-[-20px]");
    }
  });
});
