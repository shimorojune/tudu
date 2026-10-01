import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NOW_CAP_EXCEEDED_MESSAGE } from "@tudu/shared";

vi.mock("@tudu/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/shared")>();
  return {
    ...actual,
    effectiveDayIso: () => "2026-09-11",
  };
});

vi.mock("@/hooks/useProjectSpaceScope", () => ({
  useProjectSpaceScope: () => ({ kind: "personal" as const }),
}));

vi.mock("@/hooks/useTaskFieldSuggest", () => ({
  useTaskFieldSuggest: () => {},
}));

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    todayIso: () => "2026-09-11",
    useGetProjectsQuery: () => ({ data: [], isLoading: false }),
    useCreateProjectMutation: () => [vi.fn(), { isLoading: false }],
    useQuickAddSuggestMutation: () => [
      vi.fn().mockReturnValue({ unwrap: () => Promise.reject(new Error("skip")) }),
      { isLoading: false },
    ],
  };
});

import { NewTaskDialog } from "./NewTaskDialog";

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

  it("disables submit and shows full message when Now is at cap", async () => {
    const user = userEvent.setup();
    render(
      <NewTaskDialog
        open
        initialBucket="now"
        initialDate="2026-09-11"
        nowCount={5}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.type(screen.getByPlaceholderText("What needs doing?"), "One more");

    const submit = screen.getByRole("button", { name: /Add to Now/i });
    expect(submit).toBeDisabled();
    expect(screen.getByText(NOW_CAP_EXCEEDED_MESSAGE)).toBeInTheDocument();
  });

  it("shows projected open Now count when adding within cap", () => {
    render(
      <NewTaskDialog
        open
        initialBucket="now"
        initialDate="2026-09-11"
        nowCount={4}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("5 of 5")).toBeInTheDocument();
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
