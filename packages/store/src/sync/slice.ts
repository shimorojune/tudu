import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SyncEvent } from "@tudu/shared";
import {
  applyEvent,
  emptyReplica,
  replayPending,
  type PendingMutation,
  type Replica,
} from "./replica.js";

export type SyncStatus = "idle" | "connecting" | "live" | "reconnecting";

export type ViewStatus = "loading" | "ready" | "error";

export type SyncState = {
  confirmed: Replica;
  pending: PendingMutation[];
  seq: number;
  status: SyncStatus;
  views: Record<string, ViewStatus>;
  viewRefs: Record<string, number>;
};

const initialState: SyncState = {
  confirmed: emptyReplica(),
  pending: [],
  seq: 0,
  status: "idle",
  views: {},
  viewRefs: {},
};

export const syncSlice = createSlice({
  name: "sync",
  initialState,
  reducers: {
    setViewerId(state, action: PayloadAction<string | null>) {
      state.confirmed.viewerId = action.payload;
    },
    setStatus(state, action: PayloadAction<SyncStatus>) {
      state.status = action.payload;
    },
    setSeq(state, action: PayloadAction<number>) {
      if (action.payload > state.seq) {
        state.seq = action.payload;
      }
    },
    addView(state, action: PayloadAction<string>) {
      const key = action.payload;
      state.viewRefs[key] = (state.viewRefs[key] ?? 0) + 1;
      if (!state.views[key]) {
        state.views[key] = "loading";
      }
    },
    removeView(state, action: PayloadAction<string>) {
      const key = action.payload;
      const next = (state.viewRefs[key] ?? 1) - 1;
      if (next <= 0) {
        delete state.viewRefs[key];
        delete state.views[key];
      } else {
        state.viewRefs[key] = next;
      }
    },
    setViewStatus(state, action: PayloadAction<{ key: string; status: ViewStatus }>) {
      state.views[action.payload.key] = action.payload.status;
    },
    applyEvents(state, action: PayloadAction<SyncEvent[]>) {
      const moved: string[] = [];
      for (const event of action.payload) {
        if (event.seq > 0 && event.seq <= state.seq) {
          continue;
        }
        state.confirmed = applyEvent(state.confirmed, event);
        moved.push(...state.confirmed.remoteMovedTaskIds);
        if (event.seq > state.seq) {
          state.seq = event.seq;
        }
      }
      if (moved.length > 0) {
        state.confirmed.remoteMovedTaskIds = [...new Set(moved)];
      }
    },
    enqueuePending(state, action: PayloadAction<PendingMutation>) {
      state.pending.push(action.payload);
      state.confirmed = {
        ...state.confirmed,
        remoteMovedTaskIds: [],
      };
    },
    ackPending(state, action: PayloadAction<{ clientMutationId: string; events: SyncEvent[] }>) {
      state.pending = state.pending.filter(
        (item) => item.clientMutationId !== action.payload.clientMutationId,
      );
      const moved: string[] = [];
      for (const event of action.payload.events) {
        if (event.seq > 0 && event.seq <= state.seq) {
          continue;
        }
        state.confirmed = applyEvent(state.confirmed, event);
        moved.push(...state.confirmed.remoteMovedTaskIds);
        if (event.seq > state.seq) {
          state.seq = event.seq;
        }
      }
      if (moved.length > 0) {
        state.confirmed.remoteMovedTaskIds = [...new Set(moved)];
      }
    },
    failPending(state, action: PayloadAction<string>) {
      state.pending = state.pending.filter(
        (item) => item.clientMutationId !== action.payload,
      );
    },
    resetSync() {
      return initialState;
    },
    restartForViewer(state, action: PayloadAction<string>) {
      const viewRefs = state.viewRefs;
      const views: Record<string, ViewStatus> = {};
      for (const key of Object.keys(viewRefs)) {
        views[key] = "loading";
      }
      return {
        confirmed: { ...emptyReplica(), viewerId: action.payload },
        pending: [],
        seq: 0,
        status: "connecting" as SyncStatus,
        views,
        viewRefs,
      };
    },
  },
});

export const {
  setViewerId,
  setStatus,
  setSeq,
  addView,
  removeView,
  setViewStatus,
  applyEvents,
  enqueuePending,
  ackPending,
  failPending,
  resetSync,
  restartForViewer,
} = syncSlice.actions;

export function selectConfirmed(state: { sync: SyncState }): Replica {
  return state.sync.confirmed;
}

export const selectVisible = createSelector(
  [
    (state: { sync: SyncState }) => state.sync.confirmed,
    (state: { sync: SyncState }) => state.sync.pending,
  ],
  (confirmed, pending) => replayPending(confirmed, pending),
);

export function selectSyncStatus(state: { sync: SyncState }): SyncStatus {
  return state.sync.status;
}
