import { describe, expect, it } from "vitest";
import { screenFromPathname, syncOpToAnalytics } from "./analytics.js";

describe("syncOpToAnalytics", () => {
  it("maps task.create without title", () => {
    const result = syncOpToAnalytics({
      type: "task.create",
      id: "550e8400-e29b-41d4-a716-446655440000",
      body: { title: "Secret title" },
    });
    expect(result).toEqual({
      event: "task_created",
      properties: {
        task_id: "550e8400-e29b-41d4-a716-446655440000",
        op_type: "task.create",
      },
    });
    expect(result?.properties).not.toHaveProperty("title");
  });

  it("skips notification reads", () => {
    expect(
      syncOpToAnalytics({
        type: "notification.read",
        id: "550e8400-e29b-41d4-a716-446655440001",
      }),
    ).toBeNull();
  });
});

describe("screenFromPathname", () => {
  it("maps team and report routes", () => {
    expect(screenFromPathname("/team")).toEqual({ screen: "team" });
    expect(screenFromPathname("/team/user-1")).toEqual({
      screen: "report_day",
      report_user_id: "user-1",
    });
  });
});
