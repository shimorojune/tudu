import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

type DeepLinkPlugin = {
  onOpenUrl: (handler: (urls: string[]) => void) => Promise<() => void>;
};

function routeDeepLink(url: string, navigate: ReturnType<typeof useNavigate>) {
  const joinMatch = url.match(/tudu:\/\/join\/([^/?#]+)/i);
  if (joinMatch?.[1]) {
    void navigate({ to: "/join/$code", params: { code: joinMatch[1] } });
    return;
  }
  const inviteMatch = url.match(/tudu:\/\/invite\/([^/?#]+)/i);
  if (inviteMatch?.[1]) {
    void navigate({ to: "/invite/$token", params: { token: inviteMatch[1] } });
  }
}

export function useDesktopDeepLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    if (import.meta.env.TAURI_ENV_PLATFORM === undefined) {
      return;
    }

    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const deepLink = (await import(
          "@tauri-apps/plugin-deep-link"
        )) as DeepLinkPlugin;
        unlisten = await deepLink.onOpenUrl((urls) => {
          const first = urls[0];
          if (first) {
            routeDeepLink(first, navigate);
          }
        });
      } catch {
        // Plugin unavailable.
      }
    })();

    return () => {
      unlisten?.();
    };
  }, [navigate]);
}
