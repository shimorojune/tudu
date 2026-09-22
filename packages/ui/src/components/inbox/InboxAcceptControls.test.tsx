import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InboxAcceptControls } from "./InboxAcceptControls";

describe("InboxAcceptControls", () => {
  it("accepts into today's Now from the today menu", async () => {
    const onAccept = vi.fn();
    const user = userEvent.setup();

    render(
      <InboxAcceptControls
        startDate="2026-09-20"
        today="2026-09-10"
        openNowCountOnToday={0}
        onAccept={onAccept}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Accept today" }));
    await user.click(screen.getByRole("button", { name: "Now" }));

    expect(onAccept).toHaveBeenCalledWith({
      bucket: "now",
      scheduledDate: "2026-09-10",
    });
  });

  it("accepts into a future start date from the other-day panel", async () => {
    const onAccept = vi.fn();
    const user = userEvent.setup();

    render(
      <InboxAcceptControls
        startDate="2026-09-20"
        today="2026-09-10"
        openNowCountOnToday={0}
        onAccept={onAccept}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Accept another day…" }));

    expect(screen.getByRole("button", { name: "Accept date" })).toHaveTextContent(
      "Sun 20 Sep",
    );

    await user.click(screen.getByRole("button", { name: "Priority 2" }));

    expect(onAccept).toHaveBeenCalledWith({
      bucket: "next",
      scheduledDate: "2026-09-20",
    });
  });

  it("defaults the other-day picker to tomorrow when start is empty", async () => {
    const onAccept = vi.fn();
    const user = userEvent.setup();

    render(
      <InboxAcceptControls
        startDate={null}
        today="2026-09-10"
        openNowCountOnToday={0}
        onAccept={onAccept}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Accept another day…" }));
    await user.click(screen.getByRole("button", { name: "Priority 1" }));

    expect(onAccept).toHaveBeenCalledWith({
      bucket: "now",
      scheduledDate: "2026-09-11",
    });
  });
});
