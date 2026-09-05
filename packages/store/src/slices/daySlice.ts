import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function todayIso() {
  return isoDate(new Date());
}

type DayState = {
  selectedDate: string;
  selectedTaskId: string | null;
};

const initialState: DayState = {
  selectedDate: todayIso(),
  selectedTaskId: null,
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
      state.selectedDate = todayIso();
    },
    setSelectedTaskId(state, action: PayloadAction<string | null>) {
      state.selectedTaskId = action.payload;
    },
  },
});

export const {
  setSelectedDate,
  shiftSelectedDate,
  goToToday,
  setSelectedTaskId,
} = daySlice.actions;
