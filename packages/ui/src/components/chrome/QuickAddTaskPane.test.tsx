import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QuickAddTaskPane } from "./QuickAddTaskPane";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: "quick-add",
    scaleFactor: () => Promise.resolve(1),
    listen: (event: string, handler: () => void) => {
      if (event === "quick-add:shown") {
        handler();
      }
      return Promise.resolve(vi.fn());
    },
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
    useGetProjectsQuery: () => ({ data: [], isLoading: false }),
    useCreateProjectMutation: () => [vi.fn(), { isLoading: false }],
  };
});

describe("QuickAddTaskPane", () => {
  beforeEach(() => {
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
});
