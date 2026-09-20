import { compareAppVersions } from "@tudu/shared";
import { resolveUpdatesPublicBaseUrl } from "@tudu/shared";
import { Hono } from "hono";
import {
  clearReleaseCache,
  fetchLatestRelease,
  fetchReleaseAsset,
  resolveUpdatesReleaseChannelFromEnv,
  type UpdatesConfig,
} from "./updates/github.js";
import {
  findAssetByName,
  mapReleaseToManifest,
  UPDATES_ASSET_NAME,
  UPDATES_SIG_NAME,
  stripReleaseTag,
} from "./updates/mapRelease.js";

const ALLOWED_DOWNLOADS = new Set([UPDATES_ASSET_NAME]);

export type UpdatesRouteConfig = UpdatesConfig & {
  publicBaseUrl: string;
};

function resolveUpdatesConfig(): UpdatesRouteConfig | null {
  const token = process.env.UPDATES_GITHUB_TOKEN?.trim();
  const repo = process.env.UPDATES_GITHUB_REPO?.trim() || "eGainDev/tudu";
  const publicBaseUrl =
    process.env.UPDATES_PUBLIC_BASE_URL?.trim() || "https://api.tudu.rraj.dev";
  const channel = resolveUpdatesReleaseChannelFromEnv();

  if (!token) {
    return null;
  }

  return { token, repo, publicBaseUrl, channel };
}

export function createUpdatesRoute() {
  const app = new Hono();

  app.get("/updates/check", async (c) => {
    const config = resolveUpdatesConfig();
    if (!config) {
      return c.json({ error: "Updates not configured" }, 503);
    }
    const current = c.req.query("version")?.trim() ?? "";
    try {
      const release = await fetchLatestRelease(config);
      const latestVersion = stripReleaseTag(release.tag_name);
      const updateAvailable =
        current.length > 0
          ? compareAppVersions(latestVersion, current) > 0
          : true;
      return c.json({
        latestVersion,
        updateAvailable,
        releaseUrl: release.html_url,
        notes: release.body ?? "",
      });
    } catch (error) {
      clearReleaseCache();
      console.error("Failed to check updates:", error);
      return c.json({ error: "Failed to fetch update metadata" }, 502);
    }
  });

  app.get("/updates/latest.json", async (c) => {
    const config = resolveUpdatesConfig();
    if (!config) {
      return c.json({ error: "Updates not configured" }, 503);
    }

    const publicBaseUrl = resolveUpdatesPublicBaseUrl(
      c.req.header("host"),
      config.publicBaseUrl,
    );

    try {
      const release = await fetchLatestRelease(config);
      const sigAsset = findAssetByName(release, UPDATES_SIG_NAME);
      if (!sigAsset) {
        return c.json({ error: "Update signature not found" }, 404);
      }

      const signature = await fetchReleaseAssetText(config, sigAsset.url);
      const manifest = mapReleaseToManifest(release, signature, publicBaseUrl);
      if (!manifest) {
        return c.json({ error: "Update bundle not found" }, 404);
      }

      return c.json(manifest);
    } catch (error) {
      clearReleaseCache();
      console.error("Failed to build update manifest:", error);
      return c.json({ error: "Failed to fetch update metadata" }, 502);
    }
  });

  app.get("/updates/download/:name", async (c) => {
    const config = resolveUpdatesConfig();
    if (!config) {
      return c.json({ error: "Updates not configured" }, 503);
    }

    const name = c.req.param("name");
    if (!ALLOWED_DOWNLOADS.has(name)) {
      return c.json({ error: "Not found" }, 404);
    }

    try {
      const release = await fetchLatestRelease(config);
      const asset = findAssetByName(release, name);
      if (!asset) {
        return c.json({ error: "Asset not found" }, 404);
      }

      const data = await fetchReleaseAsset(config, asset.url);
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="${name}"`,
          "Cache-Control": "public, max-age=300",
        },
      });
    } catch (error) {
      clearReleaseCache();
      console.error("Failed to download update asset:", error);
      return c.json({ error: "Failed to download update asset" }, 502);
    }
  });

  return app;
}

async function fetchReleaseAssetText(
  config: UpdatesRouteConfig,
  assetUrl: string,
): Promise<string> {
  const buffer = await fetchReleaseAsset(config, assetUrl);
  return new TextDecoder().decode(buffer).trim();
}
