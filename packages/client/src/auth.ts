import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';

/** The sign-in client: send a code to an email, then sign in with it. Cookies carry the session. */
export function createAuthClientFor(baseUrl: string) {
  return createAuthClient({
    baseURL: baseUrl.replace(/\/$/, ''),
    basePath: '/api/auth',
    plugins: [emailOTPClient()],
    fetchOptions: { credentials: 'include' },
  });
}

export type AuthClient = ReturnType<typeof createAuthClientFor>;

export interface Me {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export interface SpaceSummary {
  id: string;
  kind: 'personal' | 'team';
  name: string;
  color: string | null;
  role: 'admin' | 'member';
}

export interface MeResponse {
  user: Me;
  spaces: SpaceSummary[];
}
