import { invoke } from "@tauri-apps/api/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  QUICK_ADD_EXPANDED_HEIGHT_DATE,
  QUICK_ADD_WINDOW_WIDTH,
} from "@/lib/quickAddWindowResize";
import { QuickAddTaskPane } from "./QuickAddTaskPane";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: "quick-add",
    scaleFactor: () => Promise.resolve(1),
    outerPosition: () => Promise.resolve({ x: 0, y: 0 }),
    onMoved: () => Promise.resolve(() => {}),
    startDragging: () => Promise.resolve(),
    listen: () => Promise.resolve(vi.fn()),
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: "quick-add",
    scaleFactor: () => Promise.resolve(1),
    listen: () => Promise.resolve(vi.fn()),
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
}));

vi.mock("@/lib/authClient", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "user-1" } },
      isPending: false,
    }),
  },
}));

const createTask = vi.fn();

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    todayIso: () => "2026-09-11",
    useGetTasksForDayQuery: () => ({ data: { tasks: [] } }),
    useCreateTaskMutation: () => [createTask, { isLoading: false }],
    useQuickAddSuggestMutation: () => [
      vi.fn().mockReturnValue({ unwrap: () => Promise.reject(new Error("skip")) }),
      { isLoading: false },
    ],
    useGetProjectsQuery: () => ({ data: [], isLoading: false }),
    useCreateProjectMutation: () => [vi.fn(), { isLoading: false }],
  };
});

describe("QuickAddTaskPane", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
    createTask.mockReset();
    createTask.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          task: { id: "task-1", title: "Test" },
        }),
    });
  });

  it("submits a titled task on Enter", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<QuickAddTaskPane onClose={onClose} onRequestSignIn={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("What needs doing?"), "Quick task");
    await user.keyboard("{Enter}");

    expect(createTask).toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2000 });
  });

  it("calls onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<QuickAddTaskPane onClose={onClose} onRequestSignIn={vi.fn()} />);

    const panel = screen.getByPlaceholderText("What needs doing?").closest("[tabindex='-1']");
    expect(panel).toBeTruthy();
    if (panel instanceof HTMLElement) {
      panel.focus();
    }
    await user.keyboard("{Escape}");

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2000 });
  });

  it("resizes Quick Add window before the timing date popover opens", async () => {
    let finishResize: (() => void) | undefined;
    vi.mocked(invoke).mockImplementation((cmd) => {
      if (cmd === "resize_quick_add_window") {
        return new Promise<void>((resolve) => {
          finishResize = resolve;
        });
      }
      return Promise.resolve(undefined);
    });

    const user = userEvent.setup();
    render(<QuickAddTaskPane onClose={vi.fn()} onRequestSignIn={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Start date" }));

    expect(invoke).toHaveBeenCalledWith("resize_quick_add_window", {
      width: QUICK_ADD_WINDOW_WIDTH,
      height: QUICK_ADD_EXPANDED_HEIGHT_DATE,
    });
    expect(screen.queryByRole("grid")).toBeNull();

    finishResize?.();
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });
  });

});
