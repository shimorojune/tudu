const DEFAULT_DEV_API_URL = "http://localhost:3456";

export const PROD_WEB_TO_API: Record<string, string> = {
  "tudu.ezdev.net": "https://api.tudu.ezdev.net",
  "tudu.rraj.dev": "https://api.tudu.rraj.dev",
  "staging.tudu.ezdev.net": "https://api.staging.tudu.ezdev.net",
  "staging.tudu.rraj.dev": "https://api.staging.tudu.rraj.dev",
};

export const PROD_DESKTOP_API_URL = "https://api.tudu.ezdev.net";

export const STAGING_DESKTOP_API_URL = "https://api.staging.tudu.ezdev.net";

export const PROD_DESKTOP_WEB_URL = "https://tudu.ezdev.net";

export const STAGING_DESKTOP_WEB_URL = "https://staging.tudu.ezdev.net";

const DEFAULT_DEV_WEB_URL = "http://localhost:5173";

const PROD_API_HOSTS = new Set([
  "api.tudu.ezdev.net",
  "api.tudu.rraj.dev",
  "api.staging.tudu.ezdev.net",
  "api.staging.tudu.rraj.dev",
]);

export type ResolveApiUrlOptions = {
  viteApiUrl?: string;
  isTauri?: boolean;
  webHostname?: string;
};

export function resolveApiUrlFromOptions(options: ResolveApiUrlOptions): string {
  const viteApiUrl = options.viteApiUrl?.trim();
  const hostname = options.webHostname?.trim();

  if (hostname && PROD_WEB_TO_API[hostname]) {
    return PROD_WEB_TO_API[hostname];
  }

  if (viteApiUrl) {
    const isLocalDev =
      viteApiUrl.startsWith("http://localhost") ||
      viteApiUrl.startsWith("http://127.");
    if (!options.isTauri || isLocalDev) {
      return viteApiUrl;
    }
  }

  if (options.isTauri) {
    return PROD_DESKTOP_API_URL;
  }

  if (viteApiUrl) {
    return viteApiUrl;
  }

  return DEFAULT_DEV_API_URL;
}

export function resolveWebAppBaseUrlFromApiUrl(apiUrl: string): string | null {
  const normalized = apiUrl.trim().replace(/\/$/, "");
  for (const [webHost, apiBase] of Object.entries(PROD_WEB_TO_API)) {
    if (normalized === apiBase) {
      return `https://${webHost}`;
    }
  }
  return null;
}

export function resolveWebAppBaseUrlFromOptions(
  options: ResolveApiUrlOptions,
): string {
  const hostname = options.webHostname?.trim();
  if (hostname && PROD_WEB_TO_API[hostname]) {
    return `https://${hostname}`;
  }

  const viteApiUrl = options.viteApiUrl?.trim();
  if (viteApiUrl) {
    const fromApi = resolveWebAppBaseUrlFromApiUrl(viteApiUrl);
    if (fromApi) {
      return fromApi;
    }
    const isLocalDev =
      viteApiUrl.startsWith("http://localhost") ||
      viteApiUrl.startsWith("http://127.");
    if (isLocalDev) {
      return DEFAULT_DEV_WEB_URL;
    }
  }

  if (options.isTauri) {
    if (viteApiUrl?.includes("staging.")) {
      return STAGING_DESKTOP_WEB_URL;
    }
    return PROD_DESKTOP_WEB_URL;
  }

  const location = (globalThis as { location?: { origin?: string } }).location;
  const origin =
    typeof location?.origin === "string" ? location.origin : "";
  if (origin.startsWith("http://") || origin.startsWith("https://")) {
    return origin.replace(/\/$/, "");
  }

  return DEFAULT_DEV_WEB_URL;
}

export function resolveUpdatesPublicBaseUrl(
  requestHost: string | undefined,
  envBaseUrl: string | undefined,
): string {
  const host = requestHost?.split(":")[0]?.toLowerCase();
  if (host && PROD_API_HOSTS.has(host)) {
    return `https://${host}`;
  }

  const trimmed = envBaseUrl?.trim();
  if (trimmed) {
    return trimmed.replace(/\/$/, "");
  }

  return "https://api.tudu.ezdev.net";
}
