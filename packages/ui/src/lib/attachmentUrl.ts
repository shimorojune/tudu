import { getAuthToken, resolveApiUrl } from "@tudu/store";
import { isAllowedAttachmentContentUrl } from "@tudu/shared";

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
  return isAllowedAttachmentContentUrl(src) || isAllowedAttachmentContentUrl(toAbsoluteAttachmentUrl(src));
}

export async function fetchAttachmentBlobUrl(src: string): Promise<string> {
  const url = toAbsoluteAttachmentUrl(src);
  const token = await getAuthToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to load attachment");
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function downloadAttachment(src: string, fileName: string): Promise<void> {
  const url = toAbsoluteAttachmentUrl(src);
  const token = await getAuthToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to download attachment");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
