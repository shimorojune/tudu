import type {
  SyncBootstrapResponse,
  SyncEvent,
  SyncOp,
  SyncPushResponse,
} from "@tudu/shared";
import { getAuthToken, resolveApiUrl } from "../api/baseApi.js";
import type { AppDispatch, RootState } from "../store.js";
import {
  ackPending,
  addView,
  applyEvents,
  enqueuePending,
  failPending,
  removeView,
  restartForViewer,
  setSeq,
  setStatus,
  setViewStatus,
} from "./slice.js";

async function authHeaders(json = false): Promise<HeadersInit> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {};
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function apiUrl(path: string): string {
  return `${resolveApiUrl()}${path}`;
}

export function subscribeView(key: string) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(addView(key));
    const refs = getState().sync.viewRefs[key] ?? 0;
    if (refs === 1) {
      void bootstrapView(key)(dispatch);
    }
    return () => {
      dispatch(removeView(key));
    };
  };
}

export function bootstrapView(key: string) {
  return async (dispatch: AppDispatch) => {
    dispatch(setViewStatus({ key, status: "loading" }));
    try {
      const url = new URL(apiUrl("/sync/bootstrap"));
      url.searchParams.set("views", key);
      const response = await fetch(url, {
        headers: await authHeaders(),
      });
      if (!response.ok) {
        dispatch(setViewStatus({ key, status: "error" }));
        return;
      }
      const body = (await response.json()) as SyncBootstrapResponse;
      dispatch(applyEvents(body.events));
      dispatch(setSeq(body.currentSeq));
      dispatch(setViewStatus({ key, status: "ready" }));
    } catch {
      dispatch(setViewStatus({ key, status: "error" }));
    }
  };
}

export function enqueue(op: SyncOp) {
  return async (dispatch: AppDispatch) => {
    const clientMutationId = crypto.randomUUID();
    dispatch(enqueuePending({ clientMutationId, op }));
    try {
      const response = await fetch(apiUrl("/sync"), {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({ clientMutationId, op }),
      });
      if (!response.ok) {
        dispatch(failPending(clientMutationId));
        throw new Error("Sync push failed");
      }
      const body = (await response.json()) as SyncPushResponse;
      dispatch(ackPending({ clientMutationId, events: body.events }));
      return body;
    } catch (error) {
      dispatch(failPending(clientMutationId));
      throw error;
    }
  };
}

let streamAbort: AbortController | null = null;
let streamLoop: Promise<void> | null = null;

export function startSync(viewerId: string) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    const current = getState().sync.confirmed.viewerId;
    if (streamAbort && current === viewerId) {
      return;
    }
    streamAbort?.abort();
    streamAbort = null;
    dispatch(restartForViewer(viewerId));
    const keys = Object.keys(getState().sync.viewRefs);
    for (const key of keys) {
      void bootstrapView(key)(dispatch);
    }
    streamAbort = new AbortController();
    const { signal } = streamAbort;
    dispatch(setStatus("connecting"));
    streamLoop = (async () => {
      try {
        const response = await fetch(apiUrl("/sync/bootstrap"), {
          headers: await authHeaders(),
          signal,
        });
        if (response.ok) {
          const body = (await response.json()) as SyncBootstrapResponse;
          dispatch(setSeq(body.currentSeq));
        }
      } catch {
        if (signal.aborted) {
          return;
        }
      }
      await runStream(dispatch, getState, signal);
    })();
  };
}

export function stopSync() {
  return (dispatch: AppDispatch) => {
    streamAbort?.abort();
    streamAbort = null;
    dispatch(setStatus("idle"));
  };
}

async function runStream(
  dispatch: AppDispatch,
  getState: () => RootState,
  signal: AbortSignal,
) {
  while (!signal.aborted) {
    try {
      const after = getState().sync.seq;
      const response = await fetch(apiUrl(`/sync/stream?after=${after}`), {
        headers: await authHeaders(),
        signal,
      });
      if (!response.ok || !response.body) {
        dispatch(setStatus("reconnecting"));
        await sleep(1000);
        continue;
      }
      dispatch(setStatus("live"));
      await readSse(response, (event) => {
        dispatch(applyEvents([event]));
      }, signal);
    } catch {
      if (signal.aborted) {
        return;
      }
      dispatch(setStatus("reconnecting"));
      await sleep(1000);
    }
  }
}

async function readSse(
  response: Response,
  onEvent: (event: SyncEvent) => void,
  signal: AbortSignal,
) {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const dataLine = part.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) {
        continue;
      }
      const data = dataLine.slice(5).trim();
      if (!data) {
        continue;
      }
      try {
        onEvent(JSON.parse(data) as SyncEvent);
      } catch {
        // ping or malformed
      }
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void streamLoop;
