import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommentComposer } from "./CommentComposer";

const createComment = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock("@tudu/store", () => ({
  useCreateCommentMutation: () => [createComment, { isLoading: false }],
}));

describe("CommentComposer", () => {
  it("sends on Enter and keeps Shift+Enter as a newline", async () => {
    const user = userEvent.setup();
    createComment.mockClear();

    render(<CommentComposer taskId="11111111-1111-4111-8111-111111111111" />);

    const textarea = screen.getByPlaceholderText("Add a comment…");
    await user.type(textarea, "Hello{enter}");
    expect(createComment).toHaveBeenCalledWith({
      taskId: "11111111-1111-4111-8111-111111111111",
      body: "Hello",
    });

    createComment.mockClear();
    await user.clear(textarea);
    await user.type(textarea, "Line one{shift>}{enter}Line two");
    expect(createComment).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("Line one\nLine two");
  });
});
