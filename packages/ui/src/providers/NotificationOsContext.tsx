import { createContext, useContext, type ReactNode } from "react";

export type NotificationOsValue = {
  requestOsPermission: () => Promise<boolean>;
  showOsNotification: (args: { body: string; onClick: () => void }) => Promise<void>;
};

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

async function webShow(args: { body: string; onClick: () => void }): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }
  const banner = new Notification("Tudu", { body: args.body });
  banner.onclick = () => {
    window.focus();
    args.onClick();
    banner.close();
  };
}

export const defaultNotificationOsValue: NotificationOsValue = {
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
