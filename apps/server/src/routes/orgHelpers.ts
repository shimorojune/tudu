import { OrgActionError } from "@tudu/db";

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
  return (
    process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:5173"
  );
}
