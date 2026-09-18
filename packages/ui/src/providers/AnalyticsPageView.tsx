import { screenFromPathname } from "@tudu/shared";
import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { capture, capturePageView } from "@/lib/analytics/posthog";

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

    const screenInfo = screenFromPathname(pathname);
    capture("screen_viewed", {
      origin: "client",
      screen: screenInfo.screen,
      ...(screenInfo.report_user_id
        ? { report_user_id: screenInfo.report_user_id }
        : {}),
      ...(screenInfo.project_id ? { project_id: screenInfo.project_id } : {}),
    });
  }, [pathname, searchStr]);

  return null;
}
