import { afterEach, describe, expect, it, vi } from "vitest";

const posthogInit = vi.fn();
const posthogRegister = vi.fn();
const posthogCapture = vi.fn();
const posthogIdentify = vi.fn();
const posthogReset = vi.fn();

vi.mock("posthog-js", () => ({
  default: {
    init: posthogInit,
    register: posthogRegister,
    capture: posthogCapture,
    identify: posthogIdentify,
    reset: posthogReset,
  },
}));

vi.mock("@/lib/commands", () => ({
  isDesktopApp: () => false,
}));

describe("initAnalytics", () => {
  afterEach(() => {
    vi.resetModules();
    posthogInit.mockClear();
    posthogRegister.mockClear();
  });

  it("does not init when VITE_POSTHOG_KEY is missing", async () => {
    vi.stubEnv("PROD", "true");
    vi.stubEnv("VITE_POSTHOG_KEY", "");

    const { initAnalytics } = await import("./posthog.js");
    initAnalytics();

    expect(posthogInit).not.toHaveBeenCalled();
  });

  it("inits and registers app_platform when key is set in production", async () => {
    vi.stubEnv("PROD", "true");
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");

    const { initAnalytics } = await import("./posthog.js");
    initAnalytics();

    expect(posthogInit).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "https://us.i.posthog.com",
        capture_pageview: false,
        person_profiles: "identified_only",
        disable_session_recording: false,
        capture_exceptions: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "[data-ph-mask]",
        },
      }),
    );
    expect(posthogRegister).toHaveBeenCalledWith({ app_platform: "web" });
  });
});
