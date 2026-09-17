import { isAllowedAttachmentContentUrl } from "@tudu/shared";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function descriptionHtmlReferencesBlobUrl(
  html: string,
  blobUrl: string,
): boolean {
  const pattern = new RegExp(
    `(?:src|href)\\s*=\\s*["']${escapeRegExp(blobUrl)}["']`,
    "i",
  );
  return pattern.test(html);
}

export function replaceBlobUrlInDescriptionHtmlAttributes(
  html: string,
  blobUrl: string,
  contentUrl: string,
): string {
  const pattern = new RegExp(
    `(\\b(?:src|href)\\s*=\\s*["'])${escapeRegExp(blobUrl)}(["'])`,
    "gi",
  );
  return html.replace(pattern, `$1${contentUrl}$2`);
}

export function fixAttachmentAnchorLabels(
  html: string,
  contentUrl: string,
  fileName: string,
): string {
  if (typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const anchors = doc.querySelectorAll("a");

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (href !== contentUrl) {
      continue;
    }

    const label = anchor.textContent?.trim() ?? "";
    const shouldFixLabel =
      label.length === 0 ||
      label === href ||
      label.startsWith("blob:") ||
      isAllowedAttachmentContentUrl(label);

    if (shouldFixLabel) {
      anchor.textContent = fileName;
    }

    if (!anchor.getAttribute("data-tudu-filename")?.trim()) {
      anchor.setAttribute("data-tudu-filename", fileName);
    }
  }

  return doc.body.innerHTML;
}
