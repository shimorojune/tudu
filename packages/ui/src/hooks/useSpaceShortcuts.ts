import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useListSpacesQuery } from "@tudu/store";
import { shortcutLabel, spaceForShortcut } from "@tudu/shared";
import { isCommandPaletteBlocked } from "@/components/chrome/dialogBlocker";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  return target.isContentEditable;
}

function shortcutPlatform(): "mac" | "other" {
  if (typeof navigator === "undefined") {
    return "other";
  }
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "mac" : "other";
}

function matchesSpaceShortcut(event: KeyboardEvent, index: number): boolean {
  const platform = shortcutPlatform();
  const key = String(index + 1);
  if (event.key !== key) {
    return false;
  }
  if (platform === "mac") {
    return event.ctrlKey && !event.metaKey && !event.altKey;
  }
  return event.altKey && !event.metaKey && !event.ctrlKey;
}

export function useSpaceShortcuts() {
  const navigate = useNavigate();
  const { data } = useListSpacesQuery();
  const spaces = data?.spaces ?? [{ kind: "personal" as const, name: "Personal" }];
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const spacesRef = useRef(spaces);
  spacesRef.current = spaces;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTypingTarget(event.target)) {
        return;
      }
      if (isCommandPaletteBlocked()) {
        return;
      }

      for (let index = 0; index < 9; index += 1) {
        if (!matchesSpaceShortcut(event, index)) {
          continue;
        }
        const space = spaceForShortcut(index, spacesRef.current);
        if (!space) {
          return;
        }
        event.preventDefault();
        if (space.kind === "org" && space.slug) {
          void navigateRef.current({
            to: "/o/$orgSlug",
            params: { orgSlug: space.slug },
          });
        } else {
          void navigateRef.current({ to: "/" });
        }
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

export function spaceShortcutHint(index: number): string {
  return shortcutLabel(index, shortcutPlatform());
}
