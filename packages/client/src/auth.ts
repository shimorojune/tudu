import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';
import type { GettingStarted, InboxCounts, SpaceSummary, WorkHours } from '@tudu/core';

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
  /** The colour of your mark. */
  color: string | null;
  /** When the account was made. */
  createdAt?: string;
}

export type { SpaceSummary };

export interface MeResponse {
  user: Me;
  spaces: SpaceSummary[];
  /** This session is the sign-in that made the account: a new person, not a returning one. */
  firstSignIn?: boolean;
  /** Getting started: whether the card is still to show, and which of its four are done. */
  gettingStarted?: GettingStarted;
  /** The one Inbox's count: every space, plus invites and notices. */
  inbox?: InboxCounts;
  /** Your working hours (the default until changed). */
  workHours?: WorkHours;
}
