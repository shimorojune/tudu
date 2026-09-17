import { isAllowedAttachmentContentUrl } from "@tudu/shared";

export function normalizeAttachmentLinksInHtml(html: string): string {
  if (!html.includes("/attachments/") || typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const anchors = doc.querySelectorAll("a");

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (!isAllowedAttachmentContentUrl(href)) {
      continue;
    }

    const storedName = anchor.getAttribute("data-tudu-filename")?.trim();
    const label = anchor.textContent?.trim() ?? "";
    const labelLooksLikeUrl =
      label.length === 0 ||
      label === href ||
      isAllowedAttachmentContentUrl(label);

    if (!labelLooksLikeUrl) {
      continue;
    }

    anchor.textContent = storedName || "attachment";
  }

  return doc.body.innerHTML;
}
