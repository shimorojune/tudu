import posthog from "posthog-js";
import { isDesktopApp } from "@/lib/commands";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

let initialized = false;

function analyticsKey(): string | undefined {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  return key && key.length > 0 ? key : undefined;
}

function analyticsHost(): string {
  const host = import.meta.env.VITE_POSTHOG_HOST;
  return host && host.length > 0 ? host : DEFAULT_POSTHOG_HOST;
}

function appPlatform(): "desktop" | "web" {
  return isDesktopApp() ? "desktop" : "web";
}

export function isAnalyticsEnabled(): boolean {
  return import.meta.env.PROD && analyticsKey() != null;
}

export function initAnalytics(): void {
  if (initialized || !isAnalyticsEnabled()) {
    return;
  }

  const key = analyticsKey();
  if (!key) {
    return;
  }

  posthog.init(key, {
    api_host: analyticsHost(),
    capture_pageview: false,
    person_profiles: "identified_only",
    autocapture: false,
    disable_session_recording: true,
  });

  posthog.register({ app_platform: appPlatform() });
  initialized = true;
}

export function getPostHog(): typeof posthog | null {
  if (!initialized) {
    return null;
  }
  return posthog;
}

export function capturePageView(path: string): void {
  const client = getPostHog();
  if (!client) {
    return;
  }

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}${path}`
      : path;

  client.capture("$pageview", { $current_url: url });
}

export function identifyUser(userId: string): void {
  const client = getPostHog();
  if (!client) {
    return;
  }

  client.identify(userId, { app_platform: appPlatform() });
}

export function resetAnalytics(): void {
  const client = getPostHog();
  if (!client) {
    return;
  }

  client.reset();
}

export function capture(
  event: string,
  properties?: Record<string, unknown>,
): void {
  const client = getPostHog();
  if (!client) {
    return;
  }

  client.capture(event, properties);
}
