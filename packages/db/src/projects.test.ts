import { describe, expect, it } from "vitest";
import { pickProjectToEnsure } from "@tudu/shared";
import { mapProject, mapProjectRef } from "./projects.js";
import type { ProjectRow } from "./projects-schema.js";

const now = new Date("2026-09-11T08:00:00.000Z");

function row(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-1",
    name: "EGS",
    color: "ember",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe("mapProject", () => {
  it("maps dates to ISO and keeps the color key", () => {
    expect(mapProject(row())).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      name: "EGS",
      color: "ember",
      archivedAt: null,
      createdAt: "2026-09-11T08:00:00.000Z",
      updatedAt: "2026-09-11T08:00:00.000Z",
    });
  });

  it("maps a ref without owner timestamps", () => {
    expect(mapProjectRef(row({ archivedAt: now }))).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      name: "EGS",
      color: "ember",
      archivedAt: "2026-09-11T08:00:00.000Z",
    });
  });
});

describe("ensure name match", () => {
  it("treats owner names as unique among live rows", () => {
    const archived = row({
      id: "22222222-2222-4222-8222-222222222222",
      name: "egs",
      archivedAt: now,
    });
    const active = row();

    expect(pickProjectToEnsure([archived, active], "EGS")?.id).toBe(active.id);
    expect(pickProjectToEnsure([archived], "EGS")?.id).toBe(archived.id);
  });
});
