import { resolveWebAppBaseUrlFromApiUrl } from "@tudu/shared";

export function resolveAppBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  if (explicit) {
    return explicit;
  }
  const authUrl = process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, "");
  if (authUrl) {
    const mapped = resolveWebAppBaseUrlFromApiUrl(authUrl);
    if (mapped) {
      return mapped;
    }
  }
  return "http://localhost:5173";
}

export function resolveTuduApiResourceIdentifier(): string {
  const explicit = process.env.TUDU_API_RESOURCE_URL?.trim().replace(/\/$/, "");
  if (explicit) {
    return explicit;
  }
  const authUrl = process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, "");
  if (authUrl) {
    return authUrl;
  }
  return "http://localhost:3000";
}

export function resolveOAuthLoginPage(): string {
  return `${resolveAppBaseUrl()}/sign-in`;
}

export function resolveOAuthConsentPage(): string {
  return `${resolveAppBaseUrl()}/oauth/consent`;
}
