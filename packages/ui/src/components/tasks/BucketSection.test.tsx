import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
});
