import { describe, expect, it } from "vitest";
import {
  resolveApiUrlFromOptions,
  resolveUpdatesPublicBaseUrl,
} from "./apiUrl.js";

describe("resolveApiUrlFromOptions", () => {
  it("maps rraj web host to rraj API", () => {
    expect(
      resolveApiUrlFromOptions({ webHostname: "tudu.rraj.dev" }),
    ).toBe("https://api.tudu.rraj.dev");
  });

  it("maps staging rraj web host to staging API", () => {
    expect(
      resolveApiUrlFromOptions({ webHostname: "staging.tudu.rraj.dev" }),
    ).toBe("https://api.staging.tudu.rraj.dev");
  });

  it("uses VITE_API_URL in dev when host is not prod", () => {
    expect(
      resolveApiUrlFromOptions({
        webHostname: "localhost",
        viteApiUrl: "http://localhost:3456",
      }),
    ).toBe("http://localhost:3456");
  });

  it("defaults Tauri prod to rraj API", () => {
    expect(
      resolveApiUrlFromOptions({ isTauri: true }),
    ).toBe("https://api.tudu.rraj.dev");
  });
});

describe("resolveUpdatesPublicBaseUrl", () => {
  it("uses request host for known API domains", () => {
    expect(
      resolveUpdatesPublicBaseUrl("api.tudu.rraj.dev", "https://api.example.test"),
    ).toBe("https://api.tudu.rraj.dev");
  });

  it("falls back to env when host is unknown", () => {
    expect(
      resolveUpdatesPublicBaseUrl(undefined, "https://api.tudu.rraj.dev/"),
    ).toBe("https://api.tudu.rraj.dev");
  });
});
