import { render, screen } from "@testing-library/react";
import type { Task } from "@tudu/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommentsTab } from "./CommentsTab";

const commentsState = vi.hoisted(() => ({
  isLoading: false,
  comments: [] as unknown[],
}));
const dispatch = vi.hoisted(() => vi.fn());

vi.mock("react-redux", () => ({
  useDispatch: () => dispatch,
  useSelector: () => null,
}));

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useGetCommentsQuery: () => ({
      data: { comments: commentsState.comments },
      isLoading: commentsState.isLoading,
    }),
  };
});

function makeTask(): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Local follow up",
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
    project: null,
    jiraLinks: [],
    subtasks: [],
  };
}

describe("CommentsTab", () => {
  beforeEach(() => {
    commentsState.isLoading = false;
    commentsState.comments = [];
    dispatch.mockReset();
  });

  it("shows a skeleton instead of empty space while comments load", () => {
    commentsState.isLoading = true;

    render(<CommentsTab task={makeTask()} />);

    expect(screen.getByLabelText("Loading task comments")).toBeInTheDocument();
    expect(screen.queryByText("No comments yet.")).not.toBeInTheDocument();
  });
});
