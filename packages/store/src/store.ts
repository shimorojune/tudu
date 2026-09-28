import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "./api/baseApi.js";
import { daySlice } from "./slices/daySlice.js";
import { spaceSlice } from "./slices/spaceSlice.js";
import { syncSlice } from "./sync/slice.js";
import "./api/orgsApi.js";
import "./api/healthApi.js";
import "./api/tasksApi.js";
import "./api/activityApi.js";
import "./api/linkPreviewApi.js";
import "./api/managerApi.js";
import "./api/jiraApi.js";
import "./api/quickAddApi.js";
import "./api/notificationSettingsApi.js";

export function makeStore() {
  return configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      day: daySlice.reducer,
      space: spaceSlice.reducer,
      sync: syncSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
  });
}

export const store = makeStore();

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
