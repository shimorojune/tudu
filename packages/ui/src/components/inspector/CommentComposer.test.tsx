import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommentComposer } from "./CommentComposer";

const createComment = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock("@tudu/store", () => ({
  useCreateCommentMutation: () => [createComment, { isLoading: false }],
}));

describe("CommentComposer", () => {
  it("sends rich text comments from the editor", async () => {
    createComment.mockClear();
    const user = userEvent.setup();

    render(<CommentComposer taskId="11111111-1111-4111-8111-111111111111" />);

    await user.click(screen.getByRole("textbox", { name: "Task comment" }));
    await user.keyboard("Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(createComment).toHaveBeenCalledWith({
      taskId: "11111111-1111-4111-8111-111111111111",
      body: expect.stringMatching(/^<p>.*<\/p>$/),
    });
  });

  it("renders a named read-only state when commenting is not allowed", () => {
    render(
      <CommentComposer
        taskId="11111111-1111-4111-8111-111111111111"
        disabled
      />,
    );

    expect(screen.getByRole("textbox", { name: "Task comment" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(createComment).not.toHaveBeenCalled();
  });
});
