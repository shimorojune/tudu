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
    const descriptionField = screen.getByRole("textbox", { name: "Task description" });
    await user.click(descriptionField);
    await user.clear(descriptionField);
    await user.paste("Details here");
    await user.click(screen.getByRole("button", { name: /Add to Later/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Ship fix",
        bucket: "later",
        scheduledDate: "2026-09-11",
        subtaskTitles: [],
        projectId: null,
        pendingAttachments: expect.any(Map),
      }),
    );
    expect(onSubmit.mock.calls[0]?.[0].description).toBe("<p>Details here</p>");
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

  it("prefills title and description when provided", () => {
    render(
      <NewTaskDialog
        open
        initialBucket="later"
        initialDate="2026-09-11"
        initialTitle="Remote Jira summary"
        initialDescription="Remote description"
        nowCount={0}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByPlaceholderText("What needs doing?")).toHaveValue("Remote Jira summary");
    expect(screen.getByRole("textbox", { name: "Task description" })).toHaveValue(
      "Remote description",
    );
  });
});
