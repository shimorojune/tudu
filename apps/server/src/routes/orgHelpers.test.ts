import { afterEach, describe, expect, it } from "vitest";
import { resolveAppBaseUrl } from "./orgHelpers.js";

describe("resolveAppBaseUrl", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  it("prefers APP_BASE_URL when set", () => {
    process.env = {
      ...env,
      APP_BASE_URL: "https://tudu.example.com/",
      BETTER_AUTH_URL: "https://api.tudu.ezdev.net",
    };
    expect(resolveAppBaseUrl()).toBe("https://tudu.example.com");
  });

  it("derives web URL from BETTER_AUTH_URL for known API hosts", () => {
    process.env = {
      ...env,
      APP_BASE_URL: undefined,
      BETTER_AUTH_URL: "https://api.tudu.ezdev.net",
    };
    expect(resolveAppBaseUrl()).toBe("https://tudu.ezdev.net");
  });

  it("falls back to local web URL in dev", () => {
    process.env = {
      ...env,
      APP_BASE_URL: undefined,
      BETTER_AUTH_URL: "http://localhost:3456",
    };
    expect(resolveAppBaseUrl()).toBe("http://localhost:5173");
  });
});
