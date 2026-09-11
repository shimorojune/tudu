import { describe, expect, it } from "vitest";
import type { SyncEvent, Task } from "@tudu/shared";
import {
  ackPending,
  applyEvents,
  enqueuePending,
  selectVisible,
  syncSlice,
} from "./slice.js";

const now = "2026-09-10T08:00:00.000Z";
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const mutationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: firstId,
    title: "Ship it",
    description: null,
    scheduledDate: "2026-09-10",
    bucket: "now",
    position: 0,
    startDate: null,
    deadline: null,
    completedAt: null,
    inProgress: false,
    carriedDays: 0,
    carriedSince: null,
    isPrivate: false,
    createdAt: now,
    updatedAt: now,
    commentCount: 0,
    subtasks: [],
    ...overrides,
  };
}

function upsert(
  task: Task,
  seq: number,
  clientMutationId: string | null = mutationId,
): SyncEvent {
  return {
    seq,
    recipientUserId: "priya",
    clientMutationId,
    type: "task.upsert",
    payload: { task, ownerId: "priya" },
  };
}

describe("applyEvents vs pending reorder", () => {
  it("keeps the local reorder when the first echo arrives", () => {
    const first = makeTask({ id: firstId, title: "A", position: 0 });
    const second = makeTask({ id: secondId, title: "B", position: 1 });

    let state = syncSlice.reducer(
      undefined,
      applyEvents([upsert(first, 1, null), upsert(second, 2, null)]),
    );

    state = syncSlice.reducer(
      state,
      enqueuePending({
        clientMutationId: mutationId,
        op: {
          type: "task.reorder",
          body: {
            lanes: [
              {
                scheduledDate: "2026-09-10",
                bucket: "now",
                taskIds: [secondId, firstId],
              },
            ],
          },
        },
      }),
    );

    const swapped = selectVisible({ sync: state });
    expect(swapped.tasks[firstId]?.position).toBe(1);
    expect(swapped.tasks[secondId]?.position).toBe(0);

    state = syncSlice.reducer(
      state,
      applyEvents([upsert({ ...second, position: 0 }, 3)]),
    );

    expect(state.pending).toHaveLength(1);
    const visible = selectVisible({ sync: state });
    expect(visible.tasks[firstId]?.position).toBe(1);
    expect(visible.tasks[secondId]?.position).toBe(0);

    state = syncSlice.reducer(
      state,
      ackPending({
        clientMutationId: mutationId,
        events: [
          upsert({ ...second, position: 0 }, 3),
          upsert({ ...first, position: 1 }, 4),
        ],
      }),
    );

    expect(state.pending).toHaveLength(0);
    const acked = selectVisible({ sync: state });
    expect(acked.tasks[firstId]?.position).toBe(1);
    expect(acked.tasks[secondId]?.position).toBe(0);
  });
});
