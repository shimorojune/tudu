const DEFAULT_DEV_API_URL = "http://localhost:3456";

export const PROD_WEB_TO_API: Record<string, string> = {
  "tudu.rraj.dev": "https://api.tudu.rraj.dev",
  "staging.tudu.rraj.dev": "https://api.staging.tudu.rraj.dev",
};

export const PROD_DESKTOP_API_URL = "https://api.tudu.rraj.dev";

export const STAGING_DESKTOP_API_URL = "https://api.staging.tudu.rraj.dev";

const PROD_API_HOSTS = new Set([
  "api.tudu.rraj.dev",
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

  return "https://api.tudu.rraj.dev";
}
