import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayListSkeleton } from "./DayListSkeleton";

describe("DayListSkeleton", () => {
  it("announces loading without the old copy", () => {
    render(<DayListSkeleton />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("shows today bucket labels", () => {
    render(<DayListSkeleton />);

    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("Later")).toBeInTheDocument();
  });

  it("shows other-day bucket labels when asked", () => {
    render(<DayListSkeleton isToday={false} />);

    expect(screen.getByText("Priority 1")).toBeInTheDocument();
    expect(screen.getByText("Priority 2")).toBeInTheDocument();
    expect(screen.getByText("Priority 3")).toBeInTheDocument();
  });

  it("does not use rounded corners", () => {
    const { container } = render(<DayListSkeleton />);

    expect(container.innerHTML).not.toMatch(/\brounded-/);
  });
});
