import { describe, expect, it } from "vitest";
import type { Bucket, Task } from "@tudu/shared";
import {
  containerDroppableId,
  findContainer,
  insertAfterFromPointer,
  itemsFromTasks,
  lanesFromItems,
  placeItem,
  resolveBucketDropTarget,
  tasksFromItems,
  type ContainerItems,
} from "./dragSort";

const BUCKETS = ["now", "next", "later"] as const;
const DATE = "2026-09-06";
const laneFor = (container: string) => ({
  scheduledDate: DATE,
  bucket: container as Bucket,
});

function makeTask(id: string, bucket: Bucket, position: number): Task {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    scheduledDate: DATE,
    bucket,
    position,
    startDate: null,
    deadline: null,
    completedAt: null,
    inProgress: false,
    carriedDays: 0,
    carriedSince: null,
    isPrivate: false,
    createdAt: "2026-09-06T08:00:00.000Z",
    updatedAt: "2026-09-06T08:00:00.000Z",
    subtasks: [],
    commentCount: 0,
    project: null,
    jiraLinks: [],
  };
}

/** Mirrors the recording: one row in Now, an empty Next, three rows in Later. */
const tasks = [
  makeTask("browser", "now", 0),
  makeTask("crazy", "later", 0),
  makeTask("first", "later", 1),
  makeTask("mine", "later", 2),
];

const base = itemsFromTasks(tasks, BUCKETS, (task) => task.bucket);

describe("itemsFromTasks", () => {
  it("orders every bucket by position and keeps empty buckets", () => {
    expect(base).toEqual({
      now: ["browser"],
      next: [],
      later: ["crazy", "first", "mine"],
    });
  });
});

describe("findContainer", () => {
  it("resolves a row to its bucket", () => {
    expect(findContainer(base, "first")).toBe("later");
  });

  it("resolves a bucket droppable id", () => {
    expect(findContainer(base, containerDroppableId("next"))).toBe("next");
  });

  it("returns null for an unknown id", () => {
    expect(findContainer(base, "nope")).toBeNull();
  });
});

describe("placeItem", () => {
  it("moves a row into an empty bucket", () => {
    expect(
      placeItem({
        items: base,
        activeId: "first",
        overId: containerDroppableId("next"),
        insertAfter: false,
      }),
    ).toEqual({
      now: ["browser"],
      next: ["first"],
      later: ["crazy", "mine"],
    });
  });

  it("inserts before the hovered row", () => {
    expect(
      placeItem({
        items: base,
        activeId: "mine",
        overId: "first",
        insertAfter: false,
      }).later,
    ).toEqual(["crazy", "mine", "first"]);
  });

  it("inserts after the hovered row", () => {
    expect(
      placeItem({
        items: base,
        activeId: "crazy",
        overId: "first",
        insertAfter: true,
      }).later,
    ).toEqual(["first", "crazy", "mine"]);
  });

  it("moves across buckets at the hovered index", () => {
    expect(
      placeItem({
        items: base,
        activeId: "first",
        overId: "browser",
        insertAfter: true,
      }),
    ).toEqual({
      now: ["browser", "first"],
      next: [],
      later: ["crazy", "mine"],
    });
  });

  it("returns the same object when the placement does not change", () => {
    expect(
      placeItem({
        items: base,
        activeId: "crazy",
        overId: "crazy",
        insertAfter: false,
      }),
    ).toBe(base);

    expect(
      placeItem({
        items: base,
        activeId: "crazy",
        overId: "first",
        insertAfter: false,
      }),
    ).toBe(base);
  });

  it("returns the same object for an unknown over id", () => {
    expect(
      placeItem({
        items: base,
        activeId: "crazy",
        overId: "gone",
        insertAfter: false,
      }),
    ).toBe(base);
  });
});

describe("lanesFromItems", () => {
  it("only emits buckets whose order changed", () => {
    const after = placeItem({
      items: base,
      activeId: "first",
      overId: containerDroppableId("next"),
      insertAfter: false,
    });

    expect(lanesFromItems({ before: base, after, laneFor })).toEqual([
      { scheduledDate: DATE, bucket: "next", taskIds: ["first"] },
      { scheduledDate: DATE, bucket: "later", taskIds: ["crazy", "mine"] },
    ]);
  });

  it("emits nothing when nothing moved", () => {
    expect(lanesFromItems({ before: base, after: base, laneFor })).toEqual([]);
  });
});

describe("drag sequence", () => {
  /** Release on the dragged row itself: what the recording showed failing. */
  it("commits an empty-bucket drop released over the dragged row", () => {
    const overed = placeItem({
      items: base,
      activeId: "first",
      overId: containerDroppableId("next"),
      insertAfter: false,
    });

    const ended = placeItem({
      items: overed,
      activeId: "first",
      overId: "first",
      insertAfter: false,
    });

    expect(lanesFromItems({ before: base, after: ended, laneFor })).toEqual([
      { scheduledDate: DATE, bucket: "next", taskIds: ["first"] },
      { scheduledDate: DATE, bucket: "later", taskIds: ["crazy", "mine"] },
    ]);
  });

  it("commits a same-bucket reorder released over the neighbour", () => {
    const overed = placeItem({
      items: base,
      activeId: "mine",
      overId: "crazy",
      insertAfter: false,
    });

    const ended = placeItem({
      items: overed,
      activeId: "mine",
      overId: "crazy",
      insertAfter: false,
    });

    expect(lanesFromItems({ before: base, after: ended, laneFor })).toEqual([
      { scheduledDate: DATE, bucket: "later", taskIds: ["mine", "crazy", "first"] },
    ]);
  });

  it("is idempotent when drag end repeats the drag over placement", () => {
    const overed = placeItem({
      items: base,
      activeId: "first",
      overId: "browser",
      insertAfter: true,
    });

    expect(
      placeItem({
        items: overed,
        activeId: "first",
        overId: "browser",
        insertAfter: true,
      }),
    ).toBe(overed);
  });
});

describe("tasksFromItems", () => {
  it("re-places tasks so the preview matches the pending order", () => {
    const items: ContainerItems = {
      now: ["browser"],
      next: ["first"],
      later: ["crazy", "mine"],
    };

    const preview = tasksFromItems({ tasks, items, laneFor });
    const first = preview.find((task) => task.id === "first");

    expect(first?.bucket).toBe("next");
    expect(first?.position).toBe(0);
    expect(
      preview
        .filter((task) => task.bucket === "later")
        .sort((a, b) => a.position - b.position)
        .map((task) => task.id),
    ).toEqual(["crazy", "mine"]);
  });
});

describe("insertAfterFromPointer", () => {
  it("is false above the row midpoint and true below", () => {
    expect(insertAfterFromPointer(10, 0, 40)).toBe(false);
    expect(insertAfterFromPointer(30, 0, 40)).toBe(true);
  });
});

describe("resolveBucketDropTarget", () => {
  const rects = {
    a: { top: 100, height: 40 },
    b: { top: 160, height: 40 },
    c: { top: 220, height: 40 },
  };

  it("returns null for an empty bucket", () => {
    expect(
      resolveBucketDropTarget({
        taskIds: [],
        pointerY: 150,
        rowRectFor: (id) => rects[id as keyof typeof rects] ?? null,
      }),
    ).toBeNull();
  });

  it("inserts before the first row when the pointer is above its midpoint", () => {
    expect(
      resolveBucketDropTarget({
        taskIds: ["a", "b", "c"],
        pointerY: 110,
        rowRectFor: (id) => rects[id as keyof typeof rects] ?? null,
      }),
    ).toEqual({ overId: "a", insertAfter: false });
  });

  it("inserts before the second row when the pointer sits in the first gap", () => {
    expect(
      resolveBucketDropTarget({
        taskIds: ["a", "b", "c"],
        pointerY: 150,
        rowRectFor: (id) => rects[id as keyof typeof rects] ?? null,
      }),
    ).toEqual({ overId: "b", insertAfter: false });
  });

  it("inserts after the last row when the pointer is below its midpoint", () => {
    expect(
      resolveBucketDropTarget({
        taskIds: ["a", "b", "c"],
        pointerY: 250,
        rowRectFor: (id) => rects[id as keyof typeof rects] ?? null,
      }),
    ).toEqual({ overId: "c", insertAfter: true });
  });

  it("returns null when no row rects resolve", () => {
    expect(
      resolveBucketDropTarget({
        taskIds: ["a", "b"],
        pointerY: 150,
        rowRectFor: () => null,
      }),
    ).toBeNull();
  });

  it("places at index 0 via placeItem when resolved from a bucket drop", () => {
    const items = {
      now: ["browser", "other"],
      next: [],
      later: ["crazy"],
    };
    const resolved = resolveBucketDropTarget({
      taskIds: ["browser", "other"],
      pointerY: 110,
      rowRectFor: () => ({ top: 100, height: 40 }),
    });
    expect(resolved).toEqual({ overId: "browser", insertAfter: false });

    const after = placeItem({
      items,
      activeId: "crazy",
      overId: resolved!.overId,
      insertAfter: resolved!.insertAfter,
    });
    expect(after.now).toEqual(["crazy", "browser", "other"]);
  });
});
