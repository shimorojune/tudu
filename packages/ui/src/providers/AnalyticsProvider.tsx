import { useEffect, type ReactNode } from "react";
import { initAnalytics } from "@/lib/analytics/posthog";
import { AnalyticsIdentify } from "@/providers/AnalyticsIdentify";

type AnalyticsProviderProps = {
  children: ReactNode;
};

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <>
      <AnalyticsIdentify />
      {children}
    </>
  );
}
