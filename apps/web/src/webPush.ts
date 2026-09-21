import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";
import { getAuthToken, resolveApiUrl } from "@tudu/store";
import { readFirebaseWebConfig } from "./firebaseConfig.js";

const STORED_TOKEN_KEY = "tudu_fcm_token";

let messaging: Messaging | null = null;

function getMessagingClient(): Messaging | null {
  const config = readFirebaseWebConfig();
  if (!config || typeof window === "undefined") {
    return null;
  }
  if (!messaging) {
    const app =
      getApps().length > 0
        ? getApps()[0]!
        : initializeApp({
            apiKey: config.apiKey,
            authDomain: config.authDomain,
            projectId: config.projectId,
            messagingSenderId: config.messagingSenderId,
            appId: config.appId,
          });
    messaging = getMessaging(app);
  }
  return messaging;
}

async function waitForServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.ready;
  } catch (error) {
    console.error("[webPush] service worker not ready", error);
    return null;
  }
}

export async function registerWebPushToken(): Promise<boolean> {
  const config = readFirebaseWebConfig();
  const client = getMessagingClient();
  if (!config || !client) {
    return false;
  }
  const registration = await waitForServiceWorker();
  if (!registration) {
    return false;
  }
  try {
    const token = await getToken(client, {
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) {
      return false;
    }
    const authToken = await getAuthToken();
    if (!authToken) {
      return false;
    }
    const response = await fetch(`${resolveApiUrl()}/push/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      return false;
    }
    localStorage.setItem(STORED_TOKEN_KEY, token);
    return true;
  } catch (error) {
    console.error("[webPush] token registration failed", error);
    return false;
  }
}

export async function unregisterWebPushToken(): Promise<void> {
  const stored = localStorage.getItem(STORED_TOKEN_KEY);
  if (!stored) {
    return;
  }
  const authToken = await getAuthToken();
  if (authToken) {
    try {
      await fetch(`${resolveApiUrl()}/push/unregister`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token: stored }),
      });
    } catch {
      // Best effort on sign-out.
    }
  }
  localStorage.removeItem(STORED_TOKEN_KEY);
}

export function startWebPushForegroundListener(): void {
  const client = getMessagingClient();
  if (!client) {
    return;
  }
  onMessage(client, (payload) => {
    if (document.hasFocus()) {
      return;
    }
    const data = payload.data ?? {};
    const body = data.body ?? "";
    if (!body || typeof Notification === "undefined") {
      return;
    }
    if (Notification.permission !== "granted") {
      return;
    }
    const tag = data.tag ?? data.kind ?? "tudu";
    const banner = new Notification(data.title ?? "Tudu", { body, tag });
    banner.onclick = () => {
      window.focus();
      banner.close();
      let url = "/";
      if (data.kind === "inbox" || data.kind === "inbox_declined") {
        url = "/inbox";
      } else if (data.taskId) {
        const params = new URLSearchParams();
        params.set("task", data.taskId);
        if (data.scheduledDate) {
          params.set("date", data.scheduledDate);
        }
        if (data.kind === "comment") {
          params.set("tab", "comments");
        }
        url = `/?${params.toString()}`;
      }
      window.location.assign(url);
    };
  });
}
