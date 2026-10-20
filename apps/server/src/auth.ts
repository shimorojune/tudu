import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { Db } from '@tudu/db';
import { schema } from '@tudu/db';

export interface AuthDeps {
  db: Db;
  /** The API's public origin, e.g. https://api.tudu.ezdev.net. */
  baseUrl: string;
  secret: string;
  /** Origins allowed to call the API with cookies: the web app and the desktop app. */
  trustedOrigins: string[];
  /** Send a sign-in code. Never awaited by the sign-in flow, so a slow mailer cannot leak timing. */
  sendCode: (to: string, code: string) => Promise<void> | void;
  /** Runs once when a new person signs in for the first time (their Personal space is made here). */
  onUserCreated?: (user: { id: string; email: string; name: string }) => Promise<void>;
}

/** Codes work for ten minutes. */
export const CODE_TTL_SECONDS = 600;
/** The fifth wrong code locks that code (Better Auth allows this many misses before the next one locks); a new one must be sent. */
export const CODE_ATTEMPTS = 4;
/** Sessions last thirty days and are refreshed daily while in use. */
export const SESSION_SECONDS = 60 * 60 * 24 * 30;

/**
 * Sign in is your email, then a 6-digit code we email you. No passwords; new people take the same two steps
 * and Tudu makes the account.
 */
export function createAuth(deps: AuthDeps) {
  return betterAuth({
    baseURL: deps.baseUrl,
    basePath: '/api/auth',
    secret: deps.secret,
    trustedOrigins: deps.trustedOrigins,
    database: drizzleAdapter(deps.db, { provider: 'pg', schema }),
    emailAndPassword: { enabled: false },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await deps.onUserCreated?.({ id: user.id, email: user.email, name: user.name });
          },
        },
      },
    },
    session: { expiresIn: SESSION_SECONDS, updateAge: 60 * 60 * 24 },
    // Better Auth would delete every expired code whenever anyone signs in, so someone else's sign-in could turn
    // "That code has expired" into "That code didn't work". Old codes are cleared when a code is sent instead.
    verification: { disableCleanup: true },
    advanced: { useSecureCookies: deps.baseUrl.startsWith('https://') },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: CODE_TTL_SECONDS,
        allowedAttempts: CODE_ATTEMPTS,
        storeOTP: 'hashed',
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== 'sign-in') return;
          await deps.sendCode(email, otp);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth['$Infer']['Session'];
