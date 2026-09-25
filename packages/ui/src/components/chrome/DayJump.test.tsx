import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStore, setSelectedDate } from "@tudu/store";
import { Provider } from "react-redux";
import { effectiveDayIso } from "@tudu/shared";
import { describe, expect, it, vi } from "vitest";
import { DayJump } from "./DayJump";

function offsetEffective(dayOffset: number) {
  const date = new Date(`${effectiveDayIso()}T12:00:00`);
  date.setDate(date.getDate() + dayOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("DayJump", () => {
  it("keeps Today selected for the effective day after calendar midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 26, 0, 38, 0));

    const store = makeStore();
    store.dispatch(setSelectedDate("2026-09-25"));

    render(
      <Provider store={store}>
        <DayJump />
      </Provider>,
    );

    expect(screen.getByRole("radio", { name: "Today" })).toHaveAttribute(
      "data-state",
      "on",
    );

    vi.useRealTimers();
  });

  it("selects today by default and jumps to tomorrow", async () => {
    const store = makeStore();
    store.dispatch(setSelectedDate(effectiveDayIso()));
    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <DayJump />
      </Provider>,
    );

    expect(screen.getByRole("radio", { name: "Today" })).toHaveAttribute(
      "data-state",
      "on",
    );

    await user.click(screen.getByRole("radio", { name: "Tomorrow" }));

    expect(store.getState().day.selectedDate).toBe(offsetEffective(1));
  });
});
