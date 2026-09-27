import { describe, expect, it } from "vitest";

describe("web push host", () => {
  it("documents that FCM registration is optional in test builds", () => {
    expect(import.meta.env.VITE_FIREBASE_API_KEY ?? "").toBeTypeOf("string");
  });
});
