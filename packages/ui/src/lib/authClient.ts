import { resolveApiUrl } from "@tudu/store";
import { createAuthClient } from "better-auth/react";

export const AUTH_TOKEN_KEY = "tudu_bearer_token";

const authBaseUrl = () => `${resolveApiUrl()}/api/auth`;

export const authClient = createAuthClient({
  baseURL: authBaseUrl(),
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: () => localStorage.getItem(AUTH_TOKEN_KEY) ?? "",
    },
    onSuccess: (ctx: { response: { headers: Headers } }) => {
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

export type OAuth2ConsentResult = {
  data: { url?: string; redirect_uri?: string } | null;
  error: { message: string } | null;
};

export async function oauth2Consent(input: {
  accept: boolean;
  oauth_query: string;
  scope?: string;
}): Promise<OAuth2ConsentResult> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
  const response = await fetch(`${authBaseUrl()}/oauth2/consent`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });

  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof (payload as { message: unknown }).message === "string"
        ? (payload as { message: string }).message
        : "Authorization failed";
    return { data: null, error: { message } };
  }

  return {
    data: payload as OAuth2ConsentResult["data"],
    error: null,
  };
}
