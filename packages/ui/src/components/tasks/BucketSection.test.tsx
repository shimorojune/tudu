import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_NOW_SOFT_CAP } from "@tudu/shared";
import { BucketSection } from "./BucketSection";

describe("BucketSection", () => {
  it("shows the Now clear prompt when requested", async () => {
    const onNowClearPrompt = vi.fn();
    const user = userEvent.setup();

    render(
      <BucketSection
        bucket="now"
        label="Now"
        tasks={[]}
        selectedTaskId={null}
        selectedDate="2026-09-05"
        onSelectTask={vi.fn()}
        onAddTask={vi.fn()}
        showNowClearPrompt
        onNowClearPrompt={onNowClearPrompt}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Pull the next thing in?",
    });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(onNowClearPrompt).toHaveBeenCalledOnce();
  });

  it("shows the cap badge when Now helper is visible", () => {
    render(
      <BucketSection
        bucket="now"
        label="Now"
        tasks={[]}
        selectedTaskId={null}
        selectedDate="2026-09-05"
        onSelectTask={vi.fn()}
        onAddTask={vi.fn()}
        showNowHelper
        nowCount={3}
        nowSoftCap={DEFAULT_NOW_SOFT_CAP}
      />,
    );

    expect(screen.getByText(`3 / ${DEFAULT_NOW_SOFT_CAP}`)).toBeInTheDocument();
  });

  it("highlights an over-cap Now badge", () => {
    render(
      <BucketSection
        bucket="now"
        label="Now"
        tasks={[]}
        selectedTaskId={null}
        selectedDate="2026-09-05"
        onSelectTask={vi.fn()}
        onAddTask={vi.fn()}
        showNowHelper
        nowCount={6}
        nowSoftCap={5}
      />,
    );

    expect(screen.getByText("6 / 5")).toHaveClass("bg-primary");
  });

  it("highlights the header when it is the drop target", () => {
    const { container } = render(
      <BucketSection
        bucket="next"
        label="Next"
        tasks={[]}
        selectedTaskId={null}
        selectedDate="2026-09-05"
        onSelectTask={vi.fn()}
        onAddTask={vi.fn()}
        dropTarget
      />,
    );

    const header = container.querySelector("header");
    expect(header).toHaveClass("bg-foreground/[0.06]");
    expect(screen.getByText("Next")).toHaveClass("text-foreground");
  });

  it("hides Add task in manager view", () => {
    render(
      <BucketSection
        bucket="now"
        label="Now"
        tasks={[]}
        selectedTaskId={null}
        selectedDate="2026-09-05"
        onSelectTask={vi.fn()}
        onAddTask={vi.fn()}
        viewer="manager"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Add task" }),
    ).not.toBeInTheDocument();
  });
});
