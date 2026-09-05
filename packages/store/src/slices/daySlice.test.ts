import { describe, expect, it } from "vitest";
import {
  daySlice,
  goToToday,
  setSelectedDate,
  setSelectedTaskId,
  shiftSelectedDate,
} from "./daySlice.js";

describe("daySlice selection", () => {
  it("clears selectedTaskId when the date changes", () => {
    let state = daySlice.reducer(undefined, setSelectedTaskId("abc"));
    expect(state.selectedTaskId).toBe("abc");

    state = daySlice.reducer(state, setSelectedDate("2026-09-10"));
    expect(state.selectedTaskId).toBeNull();

    state = daySlice.reducer(state, setSelectedTaskId("def"));
    state = daySlice.reducer(state, shiftSelectedDate(1));
    expect(state.selectedTaskId).toBeNull();

    state = daySlice.reducer(state, setSelectedTaskId("ghi"));
    state = daySlice.reducer(state, goToToday());
    expect(state.selectedTaskId).toBeNull();
  });
});
