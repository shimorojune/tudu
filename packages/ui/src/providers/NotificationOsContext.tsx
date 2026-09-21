import { createContext, useContext, type ReactNode } from "react";

export type NotificationOsValue = {
  getOsPermissionGranted: () => Promise<boolean>;
  requestOsPermission: () => Promise<boolean>;
  showOsNotification: (args: {
    title?: string;
    body: string;
    tag?: string;
    onClick: () => void;
  }) => Promise<void>;
};

async function webGetOsPermissionGranted(): Promise<boolean> {
  if (typeof Notification === "undefined") {
    return false;
  }
  return Notification.permission === "granted";
}

async function webRequestPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  const result = await Notification.requestPermission();
  return result === "granted";
}

async function webShow(args: {
  title?: string;
  body: string;
  tag?: string;
  onClick: () => void;
}): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }
  const banner = new Notification(args.title ?? "Tudu", {
    body: args.body,
    tag: args.tag,
  });
  banner.onclick = () => {
    window.focus();
    args.onClick();
    banner.close();
  };
}

export const defaultNotificationOsValue: NotificationOsValue = {
  getOsPermissionGranted: webGetOsPermissionGranted,
  requestOsPermission: webRequestPermission,
  showOsNotification: webShow,
};

export const NotificationOsContext = createContext<NotificationOsValue>(
  defaultNotificationOsValue,
);

export function useNotificationOs() {
  return useContext(NotificationOsContext);
}

export function NotificationOsProvider({
  value,
  children,
}: {
  value: NotificationOsValue;
  children: ReactNode;
}) {
  return (
    <NotificationOsContext.Provider value={value}>
      {children}
    </NotificationOsContext.Provider>
  );
}
