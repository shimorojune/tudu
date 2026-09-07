import type { GitHubRelease } from "./mapRelease.js";

const GITHUB_API = "https://api.github.com";

export type UpdatesConfig = {
  token: string;
  repo: string;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let releaseCache: CacheEntry<GitHubRelease> | null = null;

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "tudu-server-updates",
  };
}

function assetHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/octet-stream",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "tudu-server-updates",
  };
}

export function clearReleaseCache(): void {
  releaseCache = null;
}

export async function fetchLatestRelease(config: UpdatesConfig): Promise<GitHubRelease> {
  const now = Date.now();
  if (releaseCache && releaseCache.expiresAt > now) {
    return releaseCache.value;
  }

  const response = await fetch(`${GITHUB_API}/repos/${config.repo}/releases/latest`, {
    headers: authHeaders(config.token),
  });

  if (!response.ok) {
    throw new Error(`GitHub releases/latest failed: ${response.status}`);
  }

  const release = (await response.json()) as GitHubRelease;
  releaseCache = {
    value: release,
    expiresAt: now + CACHE_TTL_MS,
  };
  return release;
}

export async function fetchReleaseAsset(
  config: UpdatesConfig,
  assetUrl: string,
): Promise<ArrayBuffer> {
  const response = await fetch(assetUrl, {
    headers: assetHeaders(config.token),
  });

  if (!response.ok) {
    throw new Error(`GitHub asset download failed: ${response.status}`);
  }

  return response.arrayBuffer();
}

export async function fetchReleaseAssetText(
  config: UpdatesConfig,
  assetUrl: string,
): Promise<string> {
  const buffer = await fetchReleaseAsset(config, assetUrl);
  return new TextDecoder().decode(buffer).trim();
}
