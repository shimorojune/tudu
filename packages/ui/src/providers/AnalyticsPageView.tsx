import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { capturePageView } from "@/lib/analytics/posthog";

export function AnalyticsPageView() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({
    select: (state) => {
      const location = state.location as { searchStr?: string };
      return location.searchStr ?? "";
    },
  });

  useEffect(() => {
    const path = searchStr ? `${pathname}${searchStr}` : pathname;
    capturePageView(path);
  }, [pathname, searchStr]);

  return null;
}
