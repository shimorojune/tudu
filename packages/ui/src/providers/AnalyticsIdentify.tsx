import { useGetMeQuery } from "@tudu/store";
import { useEffect, useRef } from "react";
import { identifyUser, resetAnalytics } from "@/lib/analytics/posthog";

export function AnalyticsIdentify() {
  const { data: me, isSuccess, isError } = useGetMeQuery();
  const identifiedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isSuccess && me?.id) {
      if (identifiedIdRef.current !== me.id) {
        identifyUser(me.id);
        identifiedIdRef.current = me.id;
      }
      return;
    }

    if (isError || (isSuccess && !me?.id)) {
      if (identifiedIdRef.current != null) {
        resetAnalytics();
        identifiedIdRef.current = null;
      }
    }
  }, [isError, isSuccess, me?.id]);

  return null;
}
