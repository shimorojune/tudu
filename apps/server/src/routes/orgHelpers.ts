import { OrgActionError } from "@tudu/db";
import { resolveWebAppBaseUrlFromApiUrl } from "@tudu/shared";

export function mapOrgError(error: unknown): { status: number; body: { error: string; code: string } } {
  if (error instanceof OrgActionError) {
    return {
      status: error.status,
      body: { error: error.message, code: error.code },
    };
  }
  throw error;
}

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
