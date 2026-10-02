import { OrgActionError } from "@tudu/db";
import { resolveAppBaseUrl } from "../resolveOAuthPages.js";

export function mapOrgError(error: unknown): { status: number; body: { error: string; code: string } } {
  if (error instanceof OrgActionError) {
    return {
      status: error.status,
      body: { error: error.message, code: error.code },
    };
  }
  throw error;
}

export { resolveAppBaseUrl };
