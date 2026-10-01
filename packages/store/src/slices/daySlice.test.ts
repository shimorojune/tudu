import { describe, expect, it, vi } from "vitest";
import {
  daySlice,
  goToToday,
  hydrateDay,
  openTask,
  setInspectorTab,
  setSelectedDate,
  setSelectedTaskId,
  shiftSelectedDate,
} from "./daySlice.js";

describe("daySlice selection", () => {
  it("goToToday uses the effective day (before day-start hour)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T02:00:00"));
    const state = daySlice.reducer(undefined, goToToday());
    expect(state.selectedDate).toBe("2026-09-05");
    vi.useRealTimers();
  });

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

  it("keeps the inspector tab when the selected task changes", () => {
    let state = daySlice.reducer(undefined, setInspectorTab("timeline"));
    state = daySlice.reducer(state, setSelectedTaskId("abc"));
    expect(state.inspectorTab).toBe("timeline");

    state = daySlice.reducer(state, setSelectedTaskId("def"));
    expect(state.inspectorTab).toBe("timeline");
  });

  it("opens a task without clearing the selection", () => {
    const state = daySlice.reducer(
      undefined,
      openTask({
        date: "2026-09-10",
        taskId: "abc",
        inspectorTab: "comments",
        focusCommentId: "c1",
      }),
    );
    expect(state.selectedDate).toBe("2026-09-10");
    expect(state.selectedTaskId).toBe("abc");
    expect(state.inspectorTab).toBe("comments");
    expect(state.focusCommentId).toBe("c1");
  });

  it("hydrates date and task together without clearing the task", () => {
    const state = daySlice.reducer(
      undefined,
      hydrateDay({
        date: "2026-09-10",
        taskId: "abc",
        inspectorTab: "comments",
      }),
    );
    expect(state.selectedDate).toBe("2026-09-10");
    expect(state.selectedTaskId).toBe("abc");
    expect(state.inspectorTab).toBe("comments");
    expect(state.focusCommentId).toBeNull();
  });
});
