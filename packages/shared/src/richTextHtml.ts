import { isAllowedAttachmentContentUrl } from "./attachments.js";

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "del",
  "u",
  "mark",
  "sub",
  "sup",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "code",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
  "img",
  "video",
  "source",
]);

const VOID_TAGS = new Set(["br", "hr", "img", "source"]);

const BLOCK_TAGS_WITH_ALIGN = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);

const ALLOWED_TEXT_ALIGN = new Set(["left", "center", "right", "justify"]);

const BLOCKED_TAG_PATTERN =
  /<\/?(?:script|style|iframe|object|embed|form|input|button|textarea|select|meta|link)\b[^>]*>/gi;

export function looksLikeRichHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value.trim());
}

export function plainTextToRichHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "<p></p>";
  }
  if (looksLikeRichHtml(trimmed)) {
    return trimmed;
  }
  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n/g, "<br>")}</p>`;
}

export function richTextToPlainPreview(value: string): string {
  const html = looksLikeRichHtml(value) ? value : plainTextToRichHtml(value);
  return html
    .replace(/<img\b[^>]*>/gi, " [image] ")
    .replace(/<video\b[^>]*>/gi, " [video] ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|h1|h2|h3|h4|h5|h6|blockquote|tr)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function readAttr(attrs: string, name: string): string {
  const match = attrs.match(
    new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return (match?.[2] ?? match?.[3] ?? match?.[4] ?? "").trim();
}

function sanitizeTextAlignStyle(attrs: string): string {
  const styleMatch = attrs.match(/\bstyle\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const styleValue = (styleMatch?.[2] ?? styleMatch?.[3] ?? styleMatch?.[4] ?? "").trim();
  const alignMatch = styleValue.match(/text-align\s*:\s*([a-z]+)/i);
  const align = alignMatch?.[1]?.toLowerCase() ?? "";
  if (!ALLOWED_TEXT_ALIGN.has(align)) {
    return "";
  }
  return ` style="text-align: ${align}"`;
}

function sanitizeMediaSrc(tagName: string, attrs: string): string | null {
  const src = readAttr(attrs, "src");
  if (!isAllowedAttachmentContentUrl(src)) {
    return null;
  }
  const escaped = src.replace(/"/g, "&quot;");
  if (tagName === "video") {
    const hasControls = /\bcontrols\b/i.test(attrs);
    return hasControls
      ? ` src="${escaped}" controls`
      : ` src="${escaped}" controls`;
  }
  if (tagName === "img") {
    const alt = readAttr(attrs, "alt");
    const altPart =
      alt.length > 0 ? ` alt="${alt.replace(/"/g, "&quot;")}"` : "";
    return ` src="${escaped}"${altPart}`;
  }
  return ` src="${escaped}"`;
}

function sanitizeAttributes(tagName: string, attrs: string): string | null {
  if (tagName === "img" || tagName === "video" || tagName === "source") {
    return sanitizeMediaSrc(tagName, attrs);
  }
  if (tagName === "a") {
    const href = readAttr(attrs, "href");
    if (!href || /^javascript:/i.test(href) || /^data:/i.test(href)) {
      return null;
    }
    const escapedHref = href.replace(/"/g, "&quot;");
    return ` href="${escapedHref}" rel="noreferrer noopener"`;
  }
  if (BLOCK_TAGS_WITH_ALIGN.has(tagName)) {
    return sanitizeTextAlignStyle(attrs);
  }
  return "";
}

export function sanitizeRichTextHtml(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  let html = trimmed.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  html = html.replace(BLOCKED_TAG_PATTERN, "");
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  return html.replace(/<\/?([a-z0-9]+)\b([^>]*)>/gi, (match, rawTag, rawAttrs) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      return "";
    }
    if (match.startsWith("</")) {
      if (VOID_TAGS.has(tag)) {
        return "";
      }
      return `</${tag}>`;
    }
    const attrs = sanitizeAttributes(tag, String(rawAttrs ?? ""));
    if (attrs === null) {
      return "";
    }
    if (VOID_TAGS.has(tag)) {
      return `<${tag}${attrs}>`;
    }
    return `<${tag}${attrs}>`;
  });
}
