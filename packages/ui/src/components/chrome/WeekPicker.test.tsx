import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WeekPicker } from "./WeekPicker";
import { weekDaysFromWeekId } from "@/lib/week";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

describe("WeekPicker", () => {
  it("stays on a report week URL when flipping weeks", async () => {
    const user = userEvent.setup();
    const weekId = "2026-W37";
    render(
      <WeekPicker
        weekId={weekId}
        weekDays={weekDaysFromWeekId(weekId)}
        to="/team/$userId/week"
        params={{ userId: "priya" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next week" }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/team/$userId/week",
      params: { userId: "priya" },
      search: { week: "2026-W38" },
    });
  });
});
