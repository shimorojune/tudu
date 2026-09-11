import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useEffect, useMemo, type ReactNode } from "react";
import {
  NotificationOsProvider,
  type NotificationOsValue,
} from "@tudu/ui/notifications";

const pendingClicks = new Map<number, () => void>();
let nextId = 1;

async function revealMainWindow() {
  const window = getCurrentWindow();
  await window.show();
  await window.setFocus();
}

export function DesktopNotifications({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void onAction((notification) => {
      if (notification.id == null) {
        void revealMainWindow();
        return;
      }
      const handler = pendingClicks.get(notification.id);
      pendingClicks.delete(notification.id);
      void revealMainWindow();
      handler?.();
    }).then((listener) => {
      if (cancelled) {
        void listener.unregister();
        return;
      }
      unlisten = () => {
        void listener.unregister();
      };
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const value = useMemo<NotificationOsValue>(
    () => ({
      async requestOsPermission() {
        let granted = await isPermissionGranted();
        if (!granted) {
          granted = (await requestPermission()) === "granted";
        }
        return granted;
      },
      async showOsNotification({ body, onClick }) {
        const granted = await isPermissionGranted();
        if (!granted) {
          return;
        }
        const id = nextId++;
        pendingClicks.set(id, onClick);
        sendNotification({
          id,
          title: "Tudu",
          body,
          autoCancel: true,
        });
      },
    }),
    [],
  );

  return (
    <NotificationOsProvider value={value}>{children}</NotificationOsProvider>
  );
}
