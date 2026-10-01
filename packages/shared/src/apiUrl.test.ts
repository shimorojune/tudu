import { describe, expect, it } from "vitest";
import {
  resolveApiUrlFromOptions,
  resolveUpdatesPublicBaseUrl,
  resolveWebAppBaseUrlFromOptions,
} from "./apiUrl.js";

describe("resolveApiUrlFromOptions", () => {
  it("maps ezdev web host to ezdev API", () => {
    expect(
      resolveApiUrlFromOptions({ webHostname: "tudu.ezdev.net" }),
    ).toBe("https://api.tudu.ezdev.net");
  });

  it("maps rraj web host to rraj API", () => {
    expect(
      resolveApiUrlFromOptions({ webHostname: "tudu.rraj.dev" }),
    ).toBe("https://api.tudu.rraj.dev");
  });

  it("maps staging ezdev web host to staging API", () => {
    expect(
      resolveApiUrlFromOptions({ webHostname: "staging.tudu.ezdev.net" }),
    ).toBe("https://api.staging.tudu.ezdev.net");
  });

  it("uses VITE_API_URL in dev when host is not prod", () => {
    expect(
      resolveApiUrlFromOptions({
        webHostname: "localhost",
        viteApiUrl: "http://localhost:3456",
      }),
    ).toBe("http://localhost:3456");
  });

  it("defaults Tauri prod to ezdev API", () => {
    expect(
      resolveApiUrlFromOptions({ isTauri: true }),
    ).toBe("https://api.tudu.ezdev.net");
  });
});

describe("resolveWebAppBaseUrlFromOptions", () => {
  it("maps ezdev web host to ezdev web URL", () => {
    expect(
      resolveWebAppBaseUrlFromOptions({ webHostname: "tudu.ezdev.net" }),
    ).toBe("https://tudu.ezdev.net");
  });

  it("maps prod API URL to matching web URL", () => {
    expect(
      resolveWebAppBaseUrlFromOptions({
        viteApiUrl: "https://api.tudu.rraj.dev",
        isTauri: true,
      }),
    ).toBe("https://tudu.rraj.dev");
  });

  it("defaults Tauri prod to ezdev web URL", () => {
    expect(resolveWebAppBaseUrlFromOptions({ isTauri: true })).toBe(
      "https://tudu.ezdev.net",
    );
  });

  it("uses localhost web URL for local API", () => {
    expect(
      resolveWebAppBaseUrlFromOptions({
        viteApiUrl: "http://localhost:3456",
        isTauri: true,
      }),
    ).toBe("http://localhost:5173");
  });
});

describe("resolveUpdatesPublicBaseUrl", () => {
  it("uses request host for known API domains", () => {
    expect(
      resolveUpdatesPublicBaseUrl("api.tudu.ezdev.net", "https://api.tudu.rraj.dev"),
    ).toBe("https://api.tudu.ezdev.net");
  });

  it("falls back to env when host is unknown", () => {
    expect(
      resolveUpdatesPublicBaseUrl(undefined, "https://api.tudu.ezdev.net/"),
    ).toBe("https://api.tudu.ezdev.net");
  });
});
