import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStore } from "@tudu/store";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { DayJump } from "./DayJump";

function offsetIso(dayOffset: number) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("DayJump", () => {
  it("selects today by default and jumps to tomorrow", async () => {
    const store = makeStore();
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

    expect(store.getState().day.selectedDate).toBe(offsetIso(1));
  });
});
