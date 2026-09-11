import { describe, expect, it } from "vitest";
import { pickProjectToEnsure } from "@tudu/shared";
import { isPublicAssignableProject, mapProject, mapProjectRef } from "./projects.js";
import type { ProjectRow } from "./projects-schema.js";

const now = new Date("2026-09-11T08:00:00.000Z");

function row(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-1",
    name: "EGS",
    color: "ember",
    archivedAt: null,
    isPrivate: false,
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
      isPrivate: false,
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
      isPrivate: false,
    });
  });

  it("drops a private chip when the viewer is the manager", () => {
    expect(
      mapProjectRef(row({ isPrivate: true }), { hidePrivate: true }),
    ).toBeNull();
  });
});

describe("isPublicAssignableProject", () => {
  it("accepts the report's public live project", () => {
    expect(isPublicAssignableProject(row(), "user-1")).toBe(true);
  });

  it("rejects the manager's id, a private project, and an archived one", () => {
    expect(isPublicAssignableProject(row(), "manager-1")).toBe(false);
    expect(isPublicAssignableProject(row({ isPrivate: true }), "user-1")).toBe(
      false,
    );
    expect(isPublicAssignableProject(row({ archivedAt: now }), "user-1")).toBe(
      false,
    );
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
