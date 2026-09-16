import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import type { Comment } from "@tudu/shared";
import { makeStore } from "@tudu/store";
import { CommentRow } from "./CommentRow";

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useGetMeQuery: () => ({ data: { id: "priya" } }),
    useUpdateCommentMutation: () => [vi.fn(), { isLoading: false }],
    useDeleteCommentMutation: () => [vi.fn(), { isLoading: false }],
  };
});

const comment: Comment = {
  id: "22222222-2222-4222-8222-222222222222",
  taskId: "11111111-1111-4111-8111-111111111111",
  authorId: "marcus",
  body: "Looks good",
  createdAt: "2026-09-10T08:00:00.000Z",
  updatedAt: "2026-09-10T08:00:00.000Z",
  editedAt: null,
  author: { id: "marcus", name: "Marcus Bell", email: "marcus@egain.com" },
};

describe("CommentRow", () => {
  it("renders HTML bodies for other authors without showing raw tags", () => {
    const htmlComment: Comment = {
      ...comment,
      authorId: "other-user",
      body: "<p><strong>Ship it</strong></p>",
      author: { id: "other-user", name: "Other User", email: "other@egain.com" },
    };

    render(
      <Provider store={makeStore()}>
        <CommentRow comment={htmlComment} taskId={htmlComment.taskId} />
      </Provider>,
    );

    expect(screen.getByText("Ship it").tagName).toBe("STRONG");
    expect(screen.queryByText("<p><strong>Ship it</strong></p>")).toBeNull();
  });

  it("marks a focused comment for deep links", () => {
    render(
      <Provider store={makeStore()}>
        <CommentRow comment={comment} taskId={comment.taskId} focused />
      </Provider>,
    );

    const row = screen.getByText("Looks good").closest("[data-comment-id]");
    expect(row).toHaveAttribute("data-comment-id", comment.id);
    expect(row?.className).toContain("comment-focus-tint");
  });
});
