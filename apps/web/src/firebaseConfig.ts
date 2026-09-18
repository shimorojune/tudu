export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
};

export function readFirebaseWebConfig(): FirebaseWebConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? "";
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? "";
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? "";
  const messagingSenderId =
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? "";
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? "";
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY?.trim() ?? "";
  if (
    !apiKey ||
    !authDomain ||
    !projectId ||
    !messagingSenderId ||
    !appId ||
    !vapidKey
  ) {
    return null;
  }
  return {
    apiKey,
    authDomain,
    projectId,
    messagingSenderId,
    appId,
    vapidKey,
  };
}
