import { invoke } from "@tauri-apps/api/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NOW_CAP_EXCEEDED_MESSAGE, type Task } from "@tudu/shared";
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

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
}));

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({
    resolved: "light",
    preference: "light",
    paletteId: "modernist",
    setPreference: vi.fn(),
    setPaletteId: vi.fn(),
    customColors: {},
    setCustomColors: vi.fn(),
    fontId: "ar-one-sans",
    setFontId: vi.fn(),
  }),
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
const parseQuickAddTitle = vi.fn();
let suggestBucket: "now" | null = null;

vi.mock("@/hooks/useTaskTitleNaturalLanguage", () => ({
  useTaskTitleNaturalLanguage: (title: string) => parseQuickAddTitle(title),
}));

vi.mock("@/hooks/useTaskFieldSuggest", () => ({
  useTaskFieldSuggest: (args: {
    parse: ReturnType<typeof parseQuickAddTitle>;
    scheduleSource: string;
    deadlineSource: string;
    onBucket: (bucket: "now" | "next" | "later") => void;
    onDayChoice: (choice: string) => void;
    onPickedDate: (iso: string) => void;
    onDeadline: (iso: string | null) => void;
  }) => {
    const { useEffect } = require("react");
    useEffect(() => {
      if (suggestBucket) {
        args.onBucket(suggestBucket);
      }
      if (args.parse && args.scheduleSource === "auto") {
        args.onDayChoice(args.parse.dayChoice);
        args.onPickedDate(args.parse.pickedDate);
      }
      if (args.parse?.deadline && args.deadlineSource === "auto") {
        args.onDeadline(args.parse.deadline);
      }
    }, [
      args.parse,
      args.scheduleSource,
      args.deadlineSource,
      args.onBucket,
      args.onDayChoice,
      args.onPickedDate,
      args.onDeadline,
    ]);
  },
}));

const dayTasks: Task[] = [];

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    todayIso: () => "2026-09-11",
    useGetTasksForDayQuery: () => ({ data: { tasks: dayTasks } }),
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
    dayTasks.length = 0;
    suggestBucket = null;
    vi.mocked(invoke).mockClear();
    parseQuickAddTitle.mockReturnValue(null);
    createTask.mockReset();
    createTask.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          task: { id: "task-1", title: "Test" },
        }),
    });
  });

  it("does not create a task on Enter when Now is full", async () => {
    for (let index = 0; index < 5; index += 1) {
      dayTasks.push({
        id: `now-${index}`,
        title: `Task ${index}`,
        description: null,
        scheduledDate: "2026-09-11",
        bucket: "now",
        position: index,
        startDate: null,
        deadline: null,
        completedAt: null,
        inProgress: true,
        carriedDays: 0,
        carriedSince: null,
        isPrivate: false,
        createdAt: "2026-09-11T00:00:00.000Z",
        updatedAt: "2026-09-11T00:00:00.000Z",
        subtasks: [],
        commentCount: 0,
        project: null,
      });
    }

    suggestBucket = "now";
    const user = userEvent.setup();
    render(<QuickAddTaskPane onClose={vi.fn()} onRequestSignIn={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("What needs doing?"), "Overflow");
    await user.keyboard("{Enter}");

    expect(createTask).not.toHaveBeenCalled();
    expect(screen.getByText(NOW_CAP_EXCEEDED_MESSAGE)).toBeInTheDocument();
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

  it("shows deadline on the chip when chrono parses one", () => {
    parseQuickAddTitle.mockReturnValue({
      titleForSave: "Ship report",
      deadline: "2026-09-12T12:00:00.000Z",
      spans: [],
      dayChoice: "today",
      pickedDate: "2026-09-11",
      scheduledDate: "2026-09-11",
      startDate: null,
      chipLabel: "Today",
    });

    render(<QuickAddTaskPane onClose={vi.fn()} onRequestSignIn={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Deadline" })).toHaveTextContent(
      "Due 12 Sep",
    );
  });

  it("submits chrono-parsed deadline on save", async () => {
    const deadline = "2026-09-12T12:00:00.000Z";
    parseQuickAddTitle.mockReturnValue({
      titleForSave: "Ship report",
      deadline,
      spans: [],
      dayChoice: "today",
      pickedDate: "2026-09-11",
      scheduledDate: "2026-09-11",
      startDate: null,
      chipLabel: "Today",
    });

    const user = userEvent.setup();
    render(<QuickAddTaskPane onClose={vi.fn()} onRequestSignIn={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("What needs doing?"), "Ship report");
    await user.keyboard("{Enter}");

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        deadline,
      }),
    );
  });

  it("resizes Quick Add window before the day date popover opens", async () => {
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

    await user.click(screen.getByRole("button", { name: /^Today/ }));
    await user.click(screen.getByRole("button", { name: "Task date" }));

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
