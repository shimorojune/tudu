import { useEffect, useState, type ReactNode } from "react";
import { resolveApiUrl } from "@tudu/store";
import { APP_VERSION } from "@/lib/appVersion";
import {
  UpdateProvider,
  useUpdate,
  type UpdateContextValue,
} from "@/providers/UpdateContext";

type WebUpdateCheckerProps = {
  children: ReactNode;
};

export function WebUpdateChecker({ children }: WebUpdateCheckerProps) {
  const parent = useUpdate();
  const [value, setValue] = useState<UpdateContextValue>(parent);

  useEffect(() => {
    if (import.meta.env.TAURI_ENV_PLATFORM !== undefined) {
      setValue(parent);
      return;
    }

    let cancelled = false;

    async function check() {
      try {
        const base = resolveApiUrl();
        const response = await fetch(
          `${base}/updates/check?version=${encodeURIComponent(APP_VERSION)}`,
        );
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as {
          updateAvailable?: boolean;
          latestVersion?: string;
          releaseUrl?: string;
          notes?: string;
        };
        if (cancelled || !data.updateAvailable || !data.latestVersion) {
          return;
        }
        setValue((prev) => ({
          ...prev,
          phase: "available",
          version: data.latestVersion,
          releaseUrl: data.releaseUrl,
          notes: data.notes,
          dismiss: () => {
            setValue((current) => ({ ...current, phase: "hidden" }));
          },
          install: () => {
            globalThis.location.reload();
          },
          restart: () => {
            globalThis.location.reload();
          },
          openRelease: data.releaseUrl
            ? () => {
                globalThis.open(data.releaseUrl, "_blank", "noopener,noreferrer");
              }
            : undefined,
        }));
      } catch {
        // ignore
      }
    }

    void check();
    const onFocus = () => {
      void check();
    };
    globalThis.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      globalThis.removeEventListener("focus", onFocus);
    };
  }, [parent]);

  return <UpdateProvider value={value}>{children}</UpdateProvider>;
}
