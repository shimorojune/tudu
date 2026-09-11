import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewTaskDialog } from "./NewTaskDialog";

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    todayIso: () => "2026-09-11",
    useGetProjectsQuery: () => ({ data: [], isLoading: false }),
    useCreateProjectMutation: () => [vi.fn(), { isLoading: false }],
  };
});

describe("NewTaskDialog", () => {
  it("submits title and description together", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <NewTaskDialog
        open
        initialBucket="later"
        initialDate="2026-09-11"
        nowCount={0}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByPlaceholderText("What needs doing?"), "Ship fix");
    await user.type(screen.getByLabelText("Task description"), "Details here");
    await user.click(screen.getByRole("button", { name: /Add to Later/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: "Ship fix",
      description: "Details here",
      bucket: "later",
      scheduledDate: "2026-09-11",
      subtaskTitles: [],
      projectId: null,
    });
  });

  it("does not submit when Enter is pressed in the title field", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <NewTaskDialog
        open
        initialBucket="later"
        initialDate="2026-09-11"
        nowCount={0}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByPlaceholderText("What needs doing?"), "Ship fix{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
