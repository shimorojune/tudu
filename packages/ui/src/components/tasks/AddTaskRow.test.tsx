import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddTaskRow } from "./AddTaskRow";

describe("AddTaskRow", () => {
  it("submits on Enter and clears the input", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<AddTaskRow onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText(
      "Add a task, or paste a JIRA key to link one",
    );
    await user.type(input, "Ship the fix{enter}");

    expect(onSubmit).toHaveBeenCalledWith("Ship the fix");
    expect(input).toHaveValue("");
  });

  it("ignores empty Enter", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<AddTaskRow onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText(
      "Add a task, or paste a JIRA key to link one",
    );
    await user.type(input, "   {enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
