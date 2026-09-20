import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_NOW_SOFT_CAP } from "@tudu/shared";
import { QuickAddCaptureChips } from "./QuickAddCaptureChips";

vi.mock("@/components/projects/ProjectPicker", () => ({
  ProjectPicker: () => <span data-testid="project-picker" />,
}));

const baseProps = {
  bucket: "next" as const,
  pickedDate: "2026-09-12",
  today: "2026-09-11",
  projectId: null,
  title: "",
  jevSuggesting: false,
  onDayChoiceChange: vi.fn(),
  onPickedDateChange: vi.fn(),
  onBucketChange: vi.fn(),
  onProjectChange: vi.fn(),
  deadline: null,
  onDeadlineChange: vi.fn(),
};

describe("QuickAddCaptureChips bucket menu", () => {
  it("disables Now when today is at cap", async () => {
    const user = userEvent.setup();
    render(
      <QuickAddCaptureChips
        {...baseProps}
        dayChoice="today"
        nowCount={DEFAULT_NOW_SOFT_CAP}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Next\b/i }));

    const menu = screen.getByRole("dialog");
    const nowRow = within(menu).getAllByRole("button")[0];
    expect(nowRow).toHaveTextContent("Now");
    expect(nowRow).toBeDisabled();
    expect(
      within(menu).getByText(`${DEFAULT_NOW_SOFT_CAP} / ${DEFAULT_NOW_SOFT_CAP}`),
    ).toBeInTheDocument();
  });

  it("keeps Priority 1 enabled when tomorrow is selected even if nowCount is at cap", async () => {
    const user = userEvent.setup();
    render(
      <QuickAddCaptureChips
        {...baseProps}
        dayChoice="tomorrow"
        nowCount={DEFAULT_NOW_SOFT_CAP}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Priority 2\b/i }));

    const menu = screen.getByRole("dialog");
    const priorityOne = within(menu).getAllByRole("button")[0];
    expect(priorityOne).toHaveTextContent("Priority 1");
    expect(priorityOne).toBeEnabled();
    expect(
      within(menu).queryByText(`${DEFAULT_NOW_SOFT_CAP} / ${DEFAULT_NOW_SOFT_CAP}`),
    ).not.toBeInTheDocument();
  });

  it("shows Priority labels in the menu when not today", async () => {
    const user = userEvent.setup();
    render(
      <QuickAddCaptureChips
        {...baseProps}
        dayChoice="tomorrow"
        nowCount={0}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Priority 2\b/i }));

    const menu = screen.getByRole("dialog");
    const labels = within(menu)
      .getAllByRole("button")
      .map((row) => row.querySelector("span.font-bold")?.textContent);
    expect(labels).toEqual(["Priority 1", "Priority 2", "Priority 3"]);
  });
});

describe("QuickAddCaptureChips deadline chip", () => {
  it("shows No deadline when unset", () => {
    render(
      <QuickAddCaptureChips {...baseProps} dayChoice="today" nowCount={0} />,
    );

    expect(
      screen.getByRole("button", { name: "Deadline" }),
    ).toHaveTextContent("No deadline");
  });

  it("shows a due label when deadline is set", () => {
    render(
      <QuickAddCaptureChips
        {...baseProps}
        dayChoice="today"
        nowCount={0}
        deadline="2026-09-12T12:00:00.000Z"
      />,
    );

    expect(screen.getByRole("button", { name: "Deadline" })).toHaveTextContent(
      "Due 12 Sep",
    );
  });
});
