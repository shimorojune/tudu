import { describe, expect, it } from "vitest";
import {
  applyAccept,
  clampPlacementIndex,
  isFieldStale,
  nextStatus,
  proposalFields,
  voidedFieldsOnAccept,
} from "./requests.js";

describe("nextStatus", () => {
  it("allows valid transitions from pending", () => {
    expect(nextStatus("pending", "accept")).toBe("accepted");
    expect(nextStatus("pending", "decline")).toBe("declined");
    expect(nextStatus("pending", "withdraw")).toBe("withdrawn");
    expect(nextStatus("pending", "outdate")).toBe("outdated");
  });

  it("rejects invalid transitions", () => {
    expect(() => nextStatus("accepted", "accept")).toThrow(/Invalid transition/);
    expect(() => nextStatus("declined", "withdraw")).toThrow(/Invalid transition/);
  });

  it("resolves returned items", () => {
    expect(nextStatus("declined", "return_resolve")).toBe("returned_resolved");
  });
});

describe("isFieldStale", () => {
  const baseline = {
    scheduledDate: "2026-09-10",
    bucket: "next" as const,
    title: "Before",
    description: null,
    deadline: null,
    completedAt: null,
    isPrivate: false,
  };

  it("marks placement stale when day or bucket changes", () => {
    expect(
      isFieldStale("placement", baseline, {
        ...baseline,
        bucket: "now",
      }),
    ).toBe(true);
    expect(
      isFieldStale("title", baseline, { ...baseline, title: "After" }),
    ).toBe(true);
  });

  it("marks all fields stale when completion changes", () => {
    expect(
      isFieldStale("deadline", baseline, {
        ...baseline,
        completedAt: "2026-09-10T12:00:00.000Z",
      }),
    ).toBe(true);
  });
});

describe("applyAccept", () => {
  it("voids only the accepted field bucket", () => {
    expect(voidedFieldsOnAccept("title")).toEqual(["title"]);
    expect(voidedFieldsOnAccept("placement")).toEqual(["placement"]);
  });

  it("builds a patch for accepted fields", () => {
    const result = applyAccept(
      {
        title: "New title",
        placement: { scheduledDate: "2026-09-12", bucket: "next" },
      },
      ["title", "placement"],
    );
    expect(result.taskPatch.title).toBe("New title");
    expect(result.taskPatch.scheduledDate).toBe("2026-09-12");
    expect(result.taskPatch.bucket).toBe("next");
    expect(result.voidFields).toEqual(["title", "placement"]);
  });

  it("partial accept voids only the accepted field", () => {
    const result = applyAccept(
      {
        title: "A",
        deadline: "2026-09-15T18:00:00.000Z",
      },
      ["deadline"],
    );
    expect(result.taskPatch.title).toBeUndefined();
    expect(result.voidFields).toEqual(["deadline"]);
  });
});

describe("clampPlacementIndex", () => {
  it("clamps to lane bounds", () => {
    expect(clampPlacementIndex(-1, 5)).toBe(0);
    expect(clampPlacementIndex(99, 3)).toBe(2);
    expect(clampPlacementIndex(1, 3)).toBe(1);
    expect(clampPlacementIndex(0, 0)).toBe(0);
  });
});

describe("proposalFields", () => {
  it("lists only defined proposal keys", () => {
    expect(proposalFields({ title: "x", completed: true })).toEqual([
      "title",
      "completed",
    ]);
  });
});
