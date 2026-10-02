export const TUDU_OAUTH_SCOPES = ["tasks:read", "tasks:write"] as const;

export type TuduOAuthScope = (typeof TUDU_OAUTH_SCOPES)[number];

export function parseOAuthScopeHeader(scope: string | null | undefined): string[] {
  if (!scope?.trim()) {
    return [];
  }
  return scope.trim().split(/\s+/);
}

export function oauthScopesAllowRead(scopes: string[]): boolean {
  return scopes.includes("tasks:read") || scopes.includes("tasks:write");
}

export function oauthScopesAllowWrite(scopes: string[]): boolean {
  return scopes.includes("tasks:write");
}
