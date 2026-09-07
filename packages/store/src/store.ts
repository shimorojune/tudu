import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "./api/baseApi.js";
import { daySlice } from "./slices/daySlice.js";
import "./api/healthApi.js";
import "./api/tasksApi.js";
import "./api/activityApi.js";
import "./api/linkPreviewApi.js";

export function makeStore() {
  return configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      day: daySlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
  });
}

export const store = makeStore();

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
