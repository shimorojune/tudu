import type { McpExtra } from "skybridge/server";
import { text } from "skybridge/server";
import { createTuduApi } from "./api.js";

export function apiFromExtra(extra: McpExtra) {
  const token = extra.http?.authInfo?.token;
  if (!token) {
    throw new Error("Missing bearer token");
  }
  return createTuduApi(token);
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function writeCreatedResult(
  message: string,
  created: Record<string, string>,
) {
  const structuredContent = { message, ...created };
  return {
    structuredContent,
    content: [text(JSON.stringify(structuredContent, null, 2))],
    isError: false,
  };
}

export function orgQuery(orgId?: string): string {
  if (!orgId) {
    return "";
  }
  return `?orgId=${encodeURIComponent(orgId)}`;
}

export async function resolveOrgSlug(
  api: ReturnType<typeof createTuduApi>,
  orgId: string,
): Promise<string> {
  const data = await api.get<{
    spaces: Array<{ id: string; slug: string }>;
  }>("/orgs");
  const match = data.spaces.find((space) => space.id === orgId);
  if (!match) {
    throw new Error("Organization not found or access denied");
  }
  return match.slug;
}
