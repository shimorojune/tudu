import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeekGridSkeleton } from "./WeekGridSkeleton";

const weekDays = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
];

describe("WeekGridSkeleton", () => {
  it("announces loading without the old copy", () => {
    render(<WeekGridSkeleton weekDays={weekDays} />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("renders the unscheduled rail and seven day columns", () => {
    const { container } = render(<WeekGridSkeleton weekDays={weekDays} />);

    expect(screen.getAllByText("Unscheduled").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Jump to Unscheduled" }),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-week-col="unscheduled"]')).toBeTruthy();
    for (const day of weekDays) {
      expect(container.querySelector(`[data-week-col="${day}"]`)).toBeTruthy();
    }
  });

  it("does not use rounded corners", () => {
    const { container } = render(<WeekGridSkeleton weekDays={weekDays} />);

    expect(container.innerHTML).not.toMatch(/\brounded-/);
  });
});
