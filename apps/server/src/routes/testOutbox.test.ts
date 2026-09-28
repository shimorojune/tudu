import { describe, expect, it } from "vitest";
import { assertSafeTestRoutes } from "./testOutbox.js";

describe("test outbox boot guard", () => {
  it("refuses production with E2E_TEST_ROUTES", () => {
    const previousNode = process.env.NODE_ENV;
    const previousE2E = process.env.E2E_TEST_ROUTES;
    process.env.NODE_ENV = "production";
    process.env.E2E_TEST_ROUTES = "1";
    expect(() => assertSafeTestRoutes()).toThrow(/Refusing to boot/);
    process.env.NODE_ENV = previousNode;
    process.env.E2E_TEST_ROUTES = previousE2E;
  });
});
