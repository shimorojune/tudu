import type { Active, CollisionDetection } from "@dnd-kit/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { taskCollisionDetection } from "./dragCollision";

const pointerWithin = vi.fn();
const closestCorners = vi.fn();

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    pointerWithin: (...args: Parameters<typeof actual.pointerWithin>) =>
      pointerWithin(...args),
    closestCorners: (...args: Parameters<typeof actual.closestCorners>) =>
      closestCorners(...args),
  };
});

function collision(id: string) {
  return { id } as ReturnType<CollisionDetection>[number];
}

const active = { id: "active-task" } as Active;
const args = { active } as Parameters<CollisionDetection>[0];

describe("taskCollisionDetection", () => {
  beforeEach(() => {
    pointerWithin.mockReturnValue([]);
    closestCorners.mockReturnValue([]);
  });

  it("never returns the active row", () => {
    pointerWithin.mockReturnValue([
      collision("active-task"),
      collision("other-task"),
    ]);

    const result = taskCollisionDetection(args);
    expect(result.map((hit) => hit.id)).toEqual(["other-task"]);
  });

  it("returns the bucket when only the active row is under the pointer", () => {
    pointerWithin.mockReturnValue([
      collision("active-task"),
      collision("bucket-later"),
    ]);

    const result = taskCollisionDetection(args);
    expect(result.map((hit) => hit.id)).toEqual(["bucket-later"]);
  });

  it("prefers other rows over buckets", () => {
    pointerWithin.mockReturnValue([
      collision("other-task"),
      collision("bucket-later"),
    ]);

    const result = taskCollisionDetection(args);
    expect(result.map((hit) => hit.id)).toEqual(["other-task"]);
  });

  it("falls back to closestCorners when pointerWithin is empty", () => {
    closestCorners.mockReturnValue([
      collision("active-task"),
      collision("neighbor-task"),
    ]);

    const result = taskCollisionDetection(args);
    expect(result.map((hit) => hit.id)).toEqual(["neighbor-task"]);
  });
});
