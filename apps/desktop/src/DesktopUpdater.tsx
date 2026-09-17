import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { useNotificationOs } from "@tudu/ui/notifications";
import {
  UpdateProvider,
  type UpdateContextValue,
  type UpdatePhase,
} from "@tudu/ui/update";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  UPDATE_CHECK_INTERVAL_MS,
  shouldApplyUpdate,
  shouldNotifyForVersion,
  shouldRunFocusCheck,
  shouldRunUpdateCheck,
} from "./desktopUpdateSchedule.js";

const GITHUB_RELEASES_BASE = "https://github.com/eGainDev/tudu/releases/tag";

const shouldCheckForUpdates =
  import.meta.env.PROD && import.meta.env.TAURI_ENV_PLATFORM === "darwin";

type UpdateState = {
  phase: UpdatePhase;
  version?: string;
  releaseUrl?: string;
  notes?: string;
  progress?: number;
};

function resolveReleaseUrl(update: Update): string {
  const raw = update.rawJson.release_url;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }

  return `${GITHUB_RELEASES_BASE}/v${update.version}`;
}

async function revealMainWindow() {
  const window = getCurrentWindow();
  await window.show();
  await window.setFocus();
}

export function DesktopUpdater({ children }: { children: ReactNode }) {
  return <DesktopUpdaterInner>{children}</DesktopUpdaterInner>;
}

function DesktopUpdaterInner({ children }: { children: ReactNode }) {
  const { showOsNotification } = useNotificationOs();
  const updateRef = useRef<Update | null>(null);
  const releaseUrlRef = useRef<string | undefined>(undefined);
  const dismissedVersionRef = useRef<string | undefined>(undefined);
  const notifiedVersionRef = useRef<string | undefined>(undefined);
  const phaseRef = useRef<UpdatePhase>("hidden");
  const checkInFlightRef = useRef(false);
  const lastCheckAtRef = useRef<number | undefined>(undefined);
  const [state, setState] = useState<UpdateState>({ phase: "hidden" });

  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  const dismiss = useCallback(() => {
    if (state.version) {
      dismissedVersionRef.current = state.version;
    }
    setState({ phase: "hidden" });
  }, [state.version]);

  const openRelease = useCallback(() => {
    const releaseUrl = releaseUrlRef.current;
    if (!releaseUrl) {
      return;
    }

    void openUrl(releaseUrl);
  }, []);

  const applyDiscoveredUpdate = useCallback(
    async (update: Update) => {
      if (!shouldApplyUpdate(update.version, dismissedVersionRef.current)) {
        return;
      }

      const releaseUrl = resolveReleaseUrl(update);
      updateRef.current = update;
      releaseUrlRef.current = releaseUrl;
      setState({
        phase: "available",
        version: update.version,
        releaseUrl,
        notes: update.body,
      });

      const windowVisible = await getCurrentWindow().isVisible();
      if (
        !windowVisible &&
        shouldNotifyForVersion(
          update.version,
          dismissedVersionRef.current,
          notifiedVersionRef.current,
        )
      ) {
        notifiedVersionRef.current = update.version;
        void showOsNotification({
          body: `Version ${update.version} is ready. Click to update.`,
          onClick: () => {},
        });
      }
    },
    [showOsNotification],
  );

  const runCheck = useCallback(async () => {
    if (!shouldCheckForUpdates) {
      return;
    }
    if (!shouldRunUpdateCheck(phaseRef.current, checkInFlightRef.current)) {
      return;
    }

    checkInFlightRef.current = true;
    lastCheckAtRef.current = Date.now();

    try {
      const update = await check();
      if (!update) {
        return;
      }
      await applyDiscoveredUpdate(update);
    } catch (error) {
      console.error("Failed to check for updates:", error);
    } finally {
      checkInFlightRef.current = false;
    }
  }, [applyDiscoveredUpdate]);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update) {
      return;
    }

    const releaseUrl = resolveReleaseUrl(update);
    releaseUrlRef.current = releaseUrl;

    setState({
      phase: "downloading",
      version: update.version,
      releaseUrl,
      notes: update.body,
    });

    let downloadedBytes = 0;
    let totalBytes: number | undefined;

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength;
          downloadedBytes = 0;
          return;
        }

        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes && totalBytes > 0) {
            const progress = Math.min(
              100,
              Math.round((downloadedBytes / totalBytes) * 100),
            );
            setState((current) => ({
              ...current,
              phase: "downloading",
              version: update.version,
              releaseUrl,
              notes: update.body,
              progress,
            }));
          }
        }
      });

      setState({
        phase: "ready",
        version: update.version,
        releaseUrl,
        notes: update.body,
      });
      await revealMainWindow();
    } catch (error) {
      console.error("Failed to install update:", error);
      setState({
        phase: "available",
        version: update.version,
        releaseUrl,
        notes: update.body,
      });
    }
  }, []);

  const restart = useCallback(async () => {
    try {
      await relaunch();
    } catch (error) {
      console.error("Failed to restart after update:", error);
    }
  }, []);

  useEffect(() => {
    if (!shouldCheckForUpdates) {
      return;
    }

    void runCheck();

    const intervalId = window.setInterval(() => {
      void runCheck();
    }, UPDATE_CHECK_INTERVAL_MS);

    let unlistenFocus: (() => void) | undefined;
    const appWindow = getCurrentWindow();
    void appWindow
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          return;
        }
        const now = Date.now();
        if (!shouldRunFocusCheck(lastCheckAtRef.current, now)) {
          return;
        }
        void runCheck();
      })
      .then((unlisten) => {
        unlistenFocus = unlisten;
      });

    return () => {
      clearInterval(intervalId);
      unlistenFocus?.();
    };
  }, [runCheck]);

  const value = useMemo<UpdateContextValue>(
    () => ({
      phase: state.phase,
      version: state.version,
      releaseUrl: state.releaseUrl,
      notes: state.notes,
      progress: state.progress,
      dismiss,
      install: () => {
        void install();
      },
      restart: () => {
        void restart();
      },
      openRelease,
    }),
    [dismiss, install, openRelease, restart, state],
  );

  return <UpdateProvider value={value}>{children}</UpdateProvider>;
}
