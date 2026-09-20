import type { GitHubRelease } from "./mapRelease.js";

const GITHUB_API = "https://api.github.com";

export type UpdatesReleaseChannel = "production" | "staging";

export function resolveUpdatesReleaseChannelFromEnv(): UpdatesReleaseChannel {
  const raw = process.env.UPDATES_RELEASE_CHANNEL?.trim().toLowerCase();
  if (raw === "staging") {
    return "staging";
  }
  return "production";
}

export type UpdatesConfig = {
  token: string;
  repo: string;
  channel?: UpdatesReleaseChannel;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

type ReleaseCacheEntry = CacheEntry<GitHubRelease> & { key: string };

let releaseCache: ReleaseCacheEntry | null = null;

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

function cacheKey(config: UpdatesConfig): string {
  return config.channel ?? "production";
}

export async function fetchLatestRelease(config: UpdatesConfig): Promise<GitHubRelease> {
  const now = Date.now();
  const key = cacheKey(config);
  if (releaseCache && releaseCache.expiresAt > now && releaseCache.key === key) {
    return releaseCache.value;
  }

  const channel = config.channel ?? "production";
  const release =
    channel === "staging"
      ? await fetchLatestStagingRelease(config)
      : await fetchLatestProductionRelease(config);

  releaseCache = {
    key,
    value: release,
    expiresAt: now + CACHE_TTL_MS,
  };
  return release;
}

async function fetchLatestProductionRelease(config: UpdatesConfig): Promise<GitHubRelease> {
  const response = await fetch(`${GITHUB_API}/repos/${config.repo}/releases/latest`, {
    headers: authHeaders(config.token),
  });

  if (!response.ok) {
    throw new Error(`GitHub releases/latest failed: ${response.status}`);
  }

  return (await response.json()) as GitHubRelease;
}

async function fetchLatestStagingRelease(config: UpdatesConfig): Promise<GitHubRelease> {
  const response = await fetch(
    `${GITHUB_API}/repos/${config.repo}/releases?per_page=30`,
    {
      headers: authHeaders(config.token),
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub releases list failed: ${response.status}`);
  }

  const releases = (await response.json()) as GitHubRelease[];
  const staging = releases.find(
    (entry) => entry.prerelease && entry.tag_name.startsWith("tudu-"),
  );
  if (!staging) {
    throw new Error("No staging GitHub release found");
  }
  return staging;
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
