import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskIdTag } from "./TaskIdTag";

describe("TaskIdTag", () => {
  it("copies when the button is clicked", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    render(<TaskIdTag taskKey="EGSF-214" onCopy={onCopy} />);
    await user.click(screen.getByRole("button", { name: "Copy task ID" }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});
