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
  it("navigates on /week when flipping weeks", async () => {
    const user = userEvent.setup();
    const weekId = "2026-W37";
    render(<WeekPicker weekId={weekId} weekDays={weekDaysFromWeekId(weekId)} />);

    await user.click(screen.getByRole("button", { name: "Next week" }));

    expect(navigate).toHaveBeenCalledTimes(1);
    const call = navigate.mock.calls[0][0] as {
      to: string;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.to).toBe("/week");
    expect(call.search({ week: "2026-W37", date: "2026-09-10", project: "p" })).toEqual({
      week: "2026-W38",
      project: "p",
    });
  });
});
