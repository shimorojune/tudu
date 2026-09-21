import { useEffect, useMemo, type ReactNode } from "react";
import { useGetMeQuery } from "@tudu/store";
import {
  defaultNotificationOsValue,
  NotificationOsProvider,
  type NotificationOsValue,
} from "@tudu/ui/notifications";
import { readFirebaseWebConfig } from "./firebaseConfig.js";
import {
  registerWebPushToken,
  startWebPushForegroundListener,
  unregisterWebPushToken,
} from "./webPush.js";

export function WebPushHost({ children }: { children: ReactNode }) {
  const firebaseEnabled = readFirebaseWebConfig() !== null;
  const { data: me } = useGetMeQuery();

  useEffect(() => {
    if (!firebaseEnabled) {
      return;
    }
    startWebPushForegroundListener();
  }, [firebaseEnabled]);

  useEffect(() => {
    if (!firebaseEnabled) {
      return;
    }
    if (!me?.id) {
      void unregisterWebPushToken();
    }
  }, [firebaseEnabled, me?.id]);

  const notificationOs = useMemo<NotificationOsValue>(() => {
    if (!firebaseEnabled) {
      return defaultNotificationOsValue;
    }
    return {
      getOsPermissionGranted: defaultNotificationOsValue.getOsPermissionGranted,
      async requestOsPermission() {
        const granted = await defaultNotificationOsValue.requestOsPermission();
        if (granted) {
          await registerWebPushToken();
        }
        return granted;
      },
      showOsNotification: defaultNotificationOsValue.showOsNotification,
    };
  }, [firebaseEnabled]);

  if (!firebaseEnabled) {
    return <>{children}</>;
  }

  return (
    <NotificationOsProvider value={notificationOs}>
      {children}
    </NotificationOsProvider>
  );
}
