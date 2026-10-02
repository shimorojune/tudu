import { describe, expect, it } from "vitest";
import { orgQuery, writeCreatedResult } from "./toolHelpers.js";

describe("writeCreatedResult", () => {
  it("returns structuredContent with created ids", () => {
    const result = writeCreatedResult("Task created", {
      taskId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({
      message: "Task created",
      taskId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.content[0].type).toBe("text");
  });
});

describe("orgQuery", () => {
  it("returns empty string when orgId is omitted", () => {
    expect(orgQuery()).toBe("");
    expect(orgQuery(undefined)).toBe("");
  });

  it("encodes orgId in the query string", () => {
    expect(orgQuery("00000000-0000-4000-8000-0000000000ab")).toBe(
      "?orgId=00000000-0000-4000-8000-0000000000ab",
    );
  });
});
