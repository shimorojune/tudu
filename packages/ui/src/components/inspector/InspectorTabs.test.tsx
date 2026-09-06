import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InspectorTabs } from "./InspectorTabs";

describe("InspectorTabs", () => {
  it("renders the comment count and fires handlers", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClose = vi.fn();

    render(
      <InspectorTabs
        active="details"
        commentCount={3}
        onChange={onChange}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("button", { name: /Comments/i })).toHaveTextContent("3");

    await user.click(screen.getByRole("button", { name: "Timeline" }));
    expect(onChange).toHaveBeenCalledWith("timeline");

    await user.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(onClose).toHaveBeenCalled();
  });
});
