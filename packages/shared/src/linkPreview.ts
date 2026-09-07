import { z } from "zod";

export type LinkPreview = {
  url: string;
  hostname: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

export const linkPreviewQuerySchema = z.object({
  url: z.string().trim().min(1),
});

export type LinkPreviewQuery = z.infer<typeof linkPreviewQuerySchema>;

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }

  if (!IPV4.test(host)) {
    return false;
  }

  const parts = host.split(".").map(Number);
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;

  if (a === 10 || a === 127 || a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }

  return false;
}

/** True when Tudu is allowed to fetch this URL for a preview. */
export function isAllowedPreviewUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    if (url.username || url.password) {
      return false;
    }
    return !isBlockedHost(url.hostname);
  } catch {
    return false;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(value: string | null, max: number): string | null {
  if (!value) {
    return null;
  }
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function attrValue(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? null;
}

function metaContent(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const needle = key.toLowerCase();

  for (const tag of tags) {
    const property = (attrValue(tag, "property") ?? attrValue(tag, "name") ?? "")
      .toLowerCase();
    if (property !== needle) {
      continue;
    }
    const content = attrValue(tag, "content");
    if (content) {
      return decodeHtml(content);
    }
  }

  return null;
}

function firstMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const value = metaContent(html, key);
    if (value) {
      return value;
    }
  }
  return null;
}

function documentTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([^<]*)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1]) : null;
}

function faviconHref(html: string): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const rel = (attrValue(tag, "rel") ?? "").toLowerCase();
    if (!rel.split(/\s+/).includes("icon") && rel !== "shortcut icon") {
      continue;
    }
    const href = attrValue(tag, "href");
    if (href) {
      return href;
    }
  }

  return null;
}

function resolveUrl(raw: string | null, base: string): string | null {
  if (!raw) {
    return null;
  }
  try {
    const resolved = new URL(raw, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.href;
  } catch {
    return null;
  }
}

export function emptyLinkPreview(url: string): LinkPreview {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  return {
    url,
    hostname,
    title: null,
    description: null,
    imageUrl: null,
    siteName: null,
  };
}

/** Pull Open Graph / Twitter / title tags out of HTML. Pure, no I/O. */
export function parseLinkPreviewHtml(html: string, pageUrl: string): LinkPreview {
  const base = emptyLinkPreview(pageUrl);
  const title =
    firstMeta(html, ["og:title", "twitter:title"]) ?? documentTitle(html);
  const description = firstMeta(html, [
    "og:description",
    "twitter:description",
    "description",
  ]);
  const siteName = firstMeta(html, ["og:site_name"]);
  const image =
    resolveUrl(firstMeta(html, ["og:image", "twitter:image"]), pageUrl) ??
    resolveUrl(faviconHref(html), pageUrl);

  return {
    ...base,
    url: pageUrl,
    title: clip(title, 140),
    description: clip(description, 220),
    imageUrl: image,
    siteName: clip(siteName, 80),
  };
}
