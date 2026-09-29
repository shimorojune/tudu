import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { isCommandPaletteBlocked } from "@/components/chrome/dialogBlocker";
import { useNavigateDay } from "@/hooks/useNavigateDay";

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

function isTodayRoutePath(pathname: string, orgSlug: string | null): boolean {
  if (!orgSlug) {
    return pathname === "/";
  }
  const base = `/o/${orgSlug}`;
  return pathname === base;
}

export function useDayShortcuts() {
  const { jumpToTodayTab, orgSlug, shiftDay } = useNavigateDay();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onTodayView = isTodayRoutePath(pathname, orgSlug);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      if (isTypingTarget(event.target) || isCommandPaletteBlocked()) {
        return;
      }

      const key = event.key;
      if (key === "t" || key === "T") {
        event.preventDefault();
        jumpToTodayTab();
        return;
      }

      if (!onTodayView || event.shiftKey) {
        return;
      }

      if (key === "ArrowLeft") {
        event.preventDefault();
        shiftDay(-1);
        return;
      }
      if (key === "ArrowRight") {
        event.preventDefault();
        shiftDay(1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jumpToTodayTab, onTodayView, shiftDay]);
}
