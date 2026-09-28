import type { Bucket } from "@tudu/shared";

export type RequestShortcutAction =
  | { type: "accept"; bucket: Bucket }
  | { type: "decline" };

export function requestShortcutAction(
  event: KeyboardEvent,
): RequestShortcutAction | null {
  if (!event.metaKey && !event.ctrlKey) {
    return null;
  }
  if (event.shiftKey || event.altKey) {
    return null;
  }
  const key = event.key;
  if (key === "1") {
    return { type: "accept", bucket: "next" };
  }
  if (key === "2") {
    return { type: "accept", bucket: "later" };
  }
  if (key === "\\" || key === "|") {
    return { type: "decline" };
  }
  return null;
}
