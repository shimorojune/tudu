import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("disables and marks the control busy while loading", () => {
    render(
      <Button loading aria-label="Save">
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("keeps the accessible name, hides the label, and shows one spinner while loading", () => {
    render(<Button loading>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(screen.getByText("Save")).toHaveClass("invisible");
    expect(button.querySelectorAll("svg")).toHaveLength(1);
  });

  it("does not render a spinner when idle", () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(screen.getByText("Save")).not.toHaveClass("invisible");
    expect(button.querySelector("svg")).toBeNull();
  });
});
