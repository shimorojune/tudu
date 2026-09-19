import { useEffect } from "react";
import { APP_VERSION } from "@/lib/appVersion";
import { useReportClientVersionMutation } from "@tudu/store";

export function ClientVersionReporter() {
  const [report] = useReportClientVersionMutation();

  useEffect(() => {
    void report({ version: APP_VERSION });
  }, [report]);

  return null;
}
