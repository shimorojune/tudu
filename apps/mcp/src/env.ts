export function resolveTuduApiUrl(): string {
  const url = process.env.TUDU_API_URL?.trim().replace(/\/$/, "");
  if (!url) {
    return "http://localhost:3000";
  }
  return url;
}

export function resolveAuthIssuer(): string {
  const url = process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, "");
  if (!url) {
    return resolveTuduApiUrl();
  }
  return url;
}

export function resolveMcpPublicUrl(): string {
  const url = process.env.MCP_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (!url) {
    return "http://localhost:3100";
  }
  return url;
}

export function resolveApiResource(): string {
  const explicit = process.env.TUDU_API_RESOURCE_URL?.trim().replace(/\/$/, "");
  if (explicit) {
    return explicit;
  }
  return resolveAuthIssuer();
}
