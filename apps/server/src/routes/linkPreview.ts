import { zValidator } from "@hono/zod-validator";
import {
  emptyLinkPreview,
  isAllowedPreviewUrl,
  linkPreviewQuerySchema,
  parseLinkPreviewHtml,
  type LinkPreview,
} from "@tudu/shared";
import { Hono } from "hono";
import type { SessionEnv } from "../session-middleware.js";

const FETCH_MS = 5000;
const MAX_HTML_BYTES = 512 * 1024;
const CACHE_MS = 60 * 60 * 1000;
const CACHE_MAX = 200;

type CacheEntry = { preview: LinkPreview; expiresAt: number };

const cache = new Map<string, CacheEntry>();

function queryParams() {
  return zValidator("query", linkPreviewQuerySchema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Invalid query";
      return c.json({ error: message }, 400);
    }
  });
}

function readCache(url: string): LinkPreview | null {
  const entry = cache.get(url);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    cache.delete(url);
    return null;
  }
  return entry.preview;
}

function writeCache(url: string, preview: LinkPreview) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) {
      cache.delete(first);
    }
  }
  cache.set(url, { preview, expiresAt: Date.now() + CACHE_MS });
}

async function readHtml(response: Response): Promise<string> {
  const buffer = await response.arrayBuffer();
  const sliced =
    buffer.byteLength > MAX_HTML_BYTES ? buffer.slice(0, MAX_HTML_BYTES) : buffer;
  return new TextDecoder("utf-8", { fatal: false }).decode(sliced);
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const fallback = emptyLinkPreview(url);
  if (!isAllowedPreviewUrl(url)) {
    return fallback;
  }

  const cached = readCache(url);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!isAllowedPreviewUrl(response.url)) {
      writeCache(url, fallback);
      return fallback;
    }

    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.includes("html")) {
      writeCache(url, fallback);
      return fallback;
    }

    const html = await readHtml(response);
    const preview = parseLinkPreviewHtml(html, response.url || url);
    writeCache(url, preview);
    return preview;
  } catch {
    writeCache(url, fallback);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export function createLinkPreviewRoute() {
  const app = new Hono<SessionEnv>();

  app.use("*", async (c, next) => {
    const session = c.get("session");
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });

  app.get("/link-preview", queryParams(), async (c) => {
    const { url } = c.req.valid("query");
    if (!isAllowedPreviewUrl(url)) {
      return c.json({ error: "That URL cannot be previewed" }, 400);
    }

    const preview: LinkPreview = await fetchLinkPreview(url);
    return c.json(preview);
  });

  return app;
}
