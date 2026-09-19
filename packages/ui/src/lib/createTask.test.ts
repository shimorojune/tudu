import { describe, expect, it } from "vitest";
import { createTaskBody } from "./createTask.js";

describe("createTaskBody", () => {
  it("passes start and deadline through", () => {
    const body = createTaskBody({
      title: "Ship",
      scheduledDate: "2026-09-19",
      bucket: "next",
      startDate: "2026-09-18",
      deadline: "2026-09-20T18:00:00.000Z",
    });

    expect(body.startDate).toBe("2026-09-18");
    expect(body.deadline).toBe("2026-09-20T18:00:00.000Z");
  });
});
