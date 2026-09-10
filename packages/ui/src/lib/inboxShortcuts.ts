import type { Bucket } from "@tudu/shared";

export function inboxShortcutAction(
  event: KeyboardEvent,
): Bucket | "decline" | null {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod || event.shiftKey || event.altKey) {
    return null;
  }

  if (event.key === "1") {
    return "now";
  }
  if (event.key === "2") {
    return "next";
  }
  if (event.key === "3") {
    return "later";
  }
  if (event.key === "\\") {
    return "decline";
  }

  return null;
}
