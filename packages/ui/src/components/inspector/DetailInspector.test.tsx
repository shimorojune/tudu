import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "@tudu/shared";
import { DetailInspector } from "./DetailInspector";

const useGetTimelineQuery = vi.hoisted(() => vi.fn());

vi.mock("@tudu/store", () => ({
  todayIso: () => "2026-09-11",
  setInspectorTab: vi.fn(),
  setSelectedTaskId: vi.fn(),
  useGetTimelineQuery: (...args: unknown[]) => useGetTimelineQuery(...args),
}));

vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useSelector: () => "details",
}));

vi.mock("@/hooks/useCopyTaskKeyShortcut", () => ({
  useCopyTaskKeyShortcut: vi.fn(),
}));

vi.mock("@/components/inspector/DetailsTab", () => ({
  DetailsTab: () => <div>Details tab</div>,
}));

vi.mock("@/components/inspector/CommentsTab", () => ({
  CommentsTab: () => <div>Comments tab</div>,
}));

vi.mock("@/components/inspector/TimelineTab", () => ({
  TimelineTab: () => <div>Timeline tab</div>,
}));

const task: Task = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ship it",
  description: null,
  scheduledDate: "2026-09-11",
  bucket: "now",
  position: 0,
  startDate: null,
  deadline: null,
  completedAt: null,
  inProgress: false,
  carriedDays: 0,
  carriedSince: null,
  isPrivate: false,
  createdAt: "2026-09-11T08:00:00.000Z",
  updatedAt: "2026-09-11T08:00:00.000Z",
  commentCount: 0,
  subtasks: [],
  project: null,
  taskKey: "ME-1",
  orgId: null,
  ownerId: "user-1",
  pendingRequestId: null,
  jiraLinks: [],
};

describe("DetailInspector", () => {
  it("renders empty state without a task and details when a task is selected", () => {
    useGetTimelineQuery.mockReturnValue({ data: { events: [], hasMore: false } });

    const { rerender } = render(
      <DetailInspector task={null} selectedDate="2026-09-11" />,
    );
    expect(screen.getByText(/select a task/i)).toBeInTheDocument();

    rerender(<DetailInspector task={task} selectedDate="2026-09-11" />);
    expect(screen.getByText("Details tab")).toBeInTheDocument();
    expect(useGetTimelineQuery).toHaveBeenCalledWith(task.id, { skip: false });
  });

  it("skips timeline fetch when no task is selected", () => {
    useGetTimelineQuery.mockClear();
    render(<DetailInspector task={null} selectedDate="2026-09-11" />);
    expect(useGetTimelineQuery).toHaveBeenCalledWith("", { skip: true });
  });
});
