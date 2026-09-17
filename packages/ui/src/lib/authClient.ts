import { resolveApiUrl } from "@tudu/store";
import { createAuthClient } from "better-auth/react";

export const AUTH_TOKEN_KEY = "tudu_bearer_token";

export const authClient = createAuthClient({
  baseURL: `${resolveApiUrl()}/api/auth`,
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: () => localStorage.getItem(AUTH_TOKEN_KEY) ?? "",
    },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get("set-auth-token");

      if (token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
      }
    },
  },
});

export function getStoredAuthToken(): Promise<string | null> {
  return Promise.resolve(localStorage.getItem(AUTH_TOKEN_KEY));
}

export function clearStoredAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}
