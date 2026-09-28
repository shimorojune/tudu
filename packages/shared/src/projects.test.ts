import { describe, expect, it } from "vitest";
import {
  createProjectRequestSchema,
  filterProjectsForSpace,
  pickProjectToEnsure,
  projectNameKey,
  updateProjectRequestSchema,
} from "./projects.js";

describe("createProjectRequestSchema", () => {
  it("trims the name and accepts a color", () => {
    const result = createProjectRequestSchema.parse({
      name: "  EGS  ",
      color: "vermilion",
    });

    expect(result).toEqual({ name: "EGS", color: "vermilion" });
  });

  it("rejects a blank name", () => {
    const result = createProjectRequestSchema.safeParse({
      name: "   ",
      color: "vermilion",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown color", () => {
    const result = createProjectRequestSchema.safeParse({
      name: "EGS",
      color: "red",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateProjectRequestSchema", () => {
  it("rejects an empty patch", () => {
    expect(updateProjectRequestSchema.safeParse({}).success).toBe(false);
  });

  it("accepts archive", () => {
    expect(updateProjectRequestSchema.parse({ archived: true })).toEqual({
      archived: true,
    });
  });

  it("accepts a privacy flip", () => {
    expect(updateProjectRequestSchema.parse({ isPrivate: true })).toEqual({
      isPrivate: true,
    });
  });
});

describe("pickProjectToEnsure", () => {
  it("prefers an active project over an archived one with the same name", () => {
    const active = {
      name: "EGS",
      archivedAt: null,
      deletedAt: null,
    };
    const archived = {
      name: "egs",
      archivedAt: "2026-09-01T00:00:00.000Z",
      deletedAt: null,
    };

    expect(pickProjectToEnsure([archived, active], " egs ")).toBe(active);
  });

  it("reuses an archived project when no active match exists", () => {
    const archived = {
      name: "EGS",
      archivedAt: "2026-09-01T00:00:00.000Z",
      deletedAt: null,
    };

    expect(pickProjectToEnsure([archived], "EGS")).toBe(archived);
  });

  it("ignores deleted rows", () => {
    expect(
      pickProjectToEnsure(
        [{ name: "EGS", archivedAt: null, deletedAt: "2026-09-01T00:00:00.000Z" }],
        "EGS",
      ),
    ).toBeUndefined();
  });
});

describe("projectNameKey", () => {
  it("is case-insensitive", () => {
    expect(projectNameKey(" Egs ")).toBe("egs");
  });
});

describe("filterProjectsForSpace", () => {
  const sample = [
    { id: "1", name: "Personal", orgId: null },
    { id: "2", name: "Org", orgId: "org-a" },
  ];

  it("keeps personal projects in personal space", () => {
    expect(filterProjectsForSpace(sample, { kind: "personal" })).toEqual([
      sample[0],
    ]);
  });

  it("keeps matching org projects in org space", () => {
    expect(
      filterProjectsForSpace(sample, { kind: "org", orgId: "org-a" }),
    ).toEqual([sample[1]]);
  });
});
