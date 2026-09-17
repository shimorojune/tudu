import { getAuthToken, resolveApiUrl } from "@tudu/store";
import { isAllowedAttachmentContentUrl } from "@tudu/shared";

export type AttachmentDownloadFn = (
  src: string,
  fileName: string,
) => Promise<void>;

export function toAbsoluteAttachmentUrl(src: string): string {
  const trimmed = src.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  const base = resolveApiUrl().replace(/\/$/, "");
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

export function isTaskAttachmentSrc(src: string | undefined): boolean {
  if (!src) {
    return false;
  }
  return (
    isAllowedAttachmentContentUrl(src) ||
    isAllowedAttachmentContentUrl(toAbsoluteAttachmentUrl(src))
  );
}

export async function fetchAttachmentBlob(src: string): Promise<Blob> {
  const url = toAbsoluteAttachmentUrl(src);
  const token = await getAuthToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to load attachment");
  }
  return response.blob();
}

export async function fetchAttachmentBlobUrl(src: string): Promise<string> {
  const blob = await fetchAttachmentBlob(src);
  return URL.createObjectURL(blob);
}

export async function downloadAttachment(
  src: string,
  fileName: string,
): Promise<void> {
  const blob = await fetchAttachmentBlob(src);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export function resolveAttachmentLinkFileName(anchor: HTMLAnchorElement): string {
  const fromAttr = anchor.getAttribute("data-tudu-filename")?.trim();
  if (fromAttr) {
    return fromAttr;
  }
  const text = anchor.textContent?.trim();
  if (text && !isAllowedAttachmentContentUrl(text)) {
    return text;
  }
  return "download";
}

export function handleAttachmentAnchorClick(
  event: { preventDefault: () => void },
  anchor: HTMLAnchorElement,
  download: AttachmentDownloadFn,
): boolean {
  const href = anchor.getAttribute("href");
  if (!href || !isTaskAttachmentSrc(href)) {
    return false;
  }
  event.preventDefault();
  const fileName = resolveAttachmentLinkFileName(anchor);
  void download(href, fileName);
  return true;
}
