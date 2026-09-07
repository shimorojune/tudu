import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAY_START_HOUR } from "@tudu/shared";
import { MidnightBanner } from "./MidnightBanner.js";

describe("MidnightBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows between midnight and day start when calendar advanced", () => {
    vi.setSystemTime(new Date(2026, 8, 7, 1, 0));

    render(
      <MidnightBanner
        selectedDate="2026-09-06"
        onStartDay={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Nothing has moved");
  });

  it("hides after day start hour", () => {
    vi.setSystemTime(new Date(2026, 8, 7, DAY_START_HOUR, 0));

    const { container } = render(
      <MidnightBanner
        selectedDate="2026-09-06"
        onStartDay={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("calls onStartDay when starting the new day", () => {
    vi.setSystemTime(new Date(2026, 8, 7, 1, 0));
    const onStartDay = vi.fn();

    render(
      <MidnightBanner
        selectedDate="2026-09-06"
        onStartDay={onStartDay}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Start Mon 7 Sep/ }));
    expect(onStartDay).toHaveBeenCalledWith("2026-09-07");
  });
});
