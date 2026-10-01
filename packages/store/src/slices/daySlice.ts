import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { effectiveDayIso } from "@tudu/shared";

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function todayIso() {
  return isoDate(new Date());
}

export type InspectorTab = "details" | "comments" | "timeline";

type DayState = {
  selectedDate: string;
  selectedTaskId: string | null;
  inspectorTab: InspectorTab;
  focusCommentId: string | null;
  addTaskRequest: number;
};

const initialState: DayState = {
  selectedDate: todayIso(),
  selectedTaskId: null,
  inspectorTab: "details",
  focusCommentId: null,
  addTaskRequest: 0,
};

export const daySlice = createSlice({
  name: "day",
  initialState,
  reducers: {
    setSelectedDate(state, action: PayloadAction<string>) {
      state.selectedTaskId = null;
      state.selectedDate = action.payload;
    },
    shiftSelectedDate(state, action: PayloadAction<number>) {
      state.selectedTaskId = null;
      const date = new Date(`${state.selectedDate}T12:00:00`);
      date.setDate(date.getDate() + action.payload);
      state.selectedDate = isoDate(date);
    },
    goToToday(state) {
      state.selectedTaskId = null;
      state.selectedDate = effectiveDayIso();
    },
    setSelectedTaskId(state, action: PayloadAction<string | null>) {
      state.selectedTaskId = action.payload;
    },
    setInspectorTab(state, action: PayloadAction<InspectorTab>) {
      state.inspectorTab = action.payload;
    },
    openTask(
      state,
      action: PayloadAction<{
        date: string | null;
        taskId: string;
        inspectorTab: InspectorTab;
        focusCommentId?: string | null;
      }>,
    ) {
      if (action.payload.date) {
        state.selectedDate = action.payload.date;
      }
      state.selectedTaskId = action.payload.taskId;
      state.inspectorTab = action.payload.inspectorTab;
      state.focusCommentId = action.payload.focusCommentId ?? null;
    },
    hydrateDay(
      state,
      action: PayloadAction<{
        date?: string;
        taskId?: string | null;
        inspectorTab?: InspectorTab;
      }>,
    ) {
      if (action.payload.date !== undefined) {
        state.selectedDate = action.payload.date;
      }
      if (action.payload.taskId !== undefined) {
        state.selectedTaskId = action.payload.taskId;
      }
      if (action.payload.inspectorTab !== undefined) {
        state.inspectorTab = action.payload.inspectorTab;
      }
    },
    clearFocusCommentId(state) {
      state.focusCommentId = null;
    },
    requestAddTask(state) {
      state.addTaskRequest += 1;
    },
  },
});

export const {
  setSelectedDate,
  shiftSelectedDate,
  goToToday,
  setSelectedTaskId,
  setInspectorTab,
  openTask,
  hydrateDay,
  clearFocusCommentId,
  requestAddTask,
} = daySlice.actions;
