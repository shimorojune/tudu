import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { oauthProvider, type ClientMetadataResourceFetch } from '@better-auth/oauth-provider';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
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
  /** Runs after every sign-in's session is made (the first one tells a new account from a returning one). */
  onSessionCreated?: (session: { id: string; userId: string }) => Promise<void>;
  /** The web app's origin: the sign-in and consent pages an app's OAuth request is sent to. */
  webUrl: string;
  /** The Tudu MCP server's address: the one resource Tudu's OAuth tokens are for (RFC 8707). */
  mcpUrl: string;
  /**
   * How a Client ID Metadata Document is fetched. The default resolves the host once, refuses private addresses and
   * never follows redirects; tests serve fixture documents instead.
   */
  fetchClientMetadata?: ClientMetadataResourceFetch;
}

/** Codes work for ten minutes. */
export const CODE_TTL_SECONDS = 600;
/** The fifth wrong code locks that code (Better Auth allows this many misses before the next one locks); a new one must be sent. */
export const CODE_ATTEMPTS = 4;
/** Sessions last thirty days and are refreshed daily while in use. */
export const SESSION_SECONDS = 60 * 60 * 24 * 30;
/** An app's access token lasts an hour; its refresh token thirty days, and is replaced each time it is used. */
export const APP_TOKEN_SECONDS = 60 * 60;
export const APP_REFRESH_SECONDS = 60 * 60 * 24 * 30;
/** Prefixes on what Tudu hands an app, so a token is told from an API key (`tudu_`) and secret scanners know it. */
export const APP_TOKEN_PREFIX = 'tuduat_';
export const APP_REFRESH_PREFIX = 'tudurt_';

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
      session: {
        create: {
          after: async (session) => {
            await deps.onSessionCreated?.({ id: session.id, userId: session.userId });
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
      // AI access: Tudu is the authorization server for apps that use the MCP server (Claude, ChatGPT…). Tokens are
      // opaque and looked up on every call, so a disconnect takes effect at once. What an app may do is its grant
      // (`oauth_grants`), chosen on the consent page; the OAuth scopes stay plain.
      oauthProvider({
        loginPage: `${deps.webUrl}/sign-in`,
        consentPage: `${deps.webUrl}/oauth/consent`,
        disableJwtPlugin: true,
        scopes: ['profile', 'email', 'offline_access'],
        grantTypes: ['authorization_code', 'refresh_token'],
        resources: [deps.mcpUrl],
        enforcePerClientResources: false,
        accessTokenExpiresIn: APP_TOKEN_SECONDS,
        refreshTokenExpiresIn: APP_REFRESH_SECONDS,
        // A client that refreshes twice at once gets the same answer for 30 seconds instead of being cut off.
        refreshTokenReuseInterval: 30,
        prefix: { opaqueAccessToken: APP_TOKEN_PREFIX, refreshToken: APP_REFRESH_PREFIX },
        // Older clients still register themselves (DCR); Cursor and some Claude Code builds omit application_type.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: 'infer',
        // Ten registrations an hour per address is plenty for real clients (Better Auth's limiter, production only;
        // the API's own limiter in app.ts covers every environment).
        rateLimit: { register: { window: 3600, max: 10 } },
      }),
      // Clients that name themselves by a metadata URL (MCP's preferred way): fetched, checked, cached an hour.
      cimd({
        fetchClientMetadataResource: deps.fetchClientMetadata ?? fetchClientMetadataResource,
        metadataProfile: 'mcp-2026-07-28',
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth['$Infer']['Session'];
