import { describe, expect, it } from "vitest";
import {
  createCommentRequestSchema,
  timelineQuerySchema,
  updateCommentRequestSchema,
} from "./activity.js";

describe("activity schemas", () => {
  it("requires non-empty comment bodies", () => {
    expect(() => createCommentRequestSchema.parse({ body: "   " })).toThrow();
    const ok = createCommentRequestSchema.parse({ body: "Hello" });
    expect(ok.body).toBe("Hello");
  });

  it("validates timeline limit bounds", () => {
    expect(timelineQuerySchema.parse({}).limit).toBe(50);
    expect(timelineQuerySchema.parse({ limit: 10 }).limit).toBe(10);
    expect(timelineQuerySchema.parse({ limit: 100 }).limit).toBe(100);
    expect(() => timelineQuerySchema.parse({ limit: 200 })).toThrow();
  });

  it("validates update comment body", () => {
    expect(() => updateCommentRequestSchema.parse({ body: "" })).toThrow();
  });
});
