import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColourPicker } from "./ColourPicker";

describe("ColourPicker", () => {
  it("opens on click and shows colour names", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ColourPicker value="vermilion" onChange={onChange} clashes={[]} />,
    );

    await user.click(
      screen.getByRole("button", { name: /Colour, Vermilion/i }),
    );
    expect(screen.getByRole("option", { name: "Cobalt" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Cobalt" }));
    expect(onChange).toHaveBeenCalledWith("cobalt");
  });

  it("marks clashes with short codes", async () => {
    const user = userEvent.setup();
    render(
      <ColourPicker
        value="vermilion"
        onChange={vi.fn()}
        clashes={[{ color: "cobalt", shortCode: "OPS" }]}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Colour, Vermilion/i }),
    );
    expect(screen.getByText("OPS")).toBeInTheDocument();
  });
});
