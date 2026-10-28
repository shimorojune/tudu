import { AsyncLocalStorage } from 'node:async_hooks';
import type { schema } from '@tudu/db';
import type { Session } from '../auth';

/**
 * AI access: what a caller that isn't a signed-in browser may do. A key (`tudu_…`, made in Settings) and an app
 * (an OAuth token from the consent page) both come down to this, so one check (`middleware/keyAccess.ts`) serves
 * both. A cookie session has no `Access` and is never narrowed.
 */
export interface Access {
  kind: 'key' | 'app';
  /** The key's id, or the app's OAuth client id. */
  id: string;
  /** "Claude Code on my Mac", "Claude": how history and errors name it. */
  name: string;
  level: 'read' | 'write';
  canDelete: boolean;
  /** Null: every space you are in, now and later. */
  spaces: string[] | null;
  notebook: boolean;
}

/** What a key or app may reach, as Settings and `/api/access` show it. */
export type Reach = Pick<Access, 'level' | 'canDelete' | 'spaces' | 'notebook'>;

export function bearerOf(headers: Headers): string | null {
  const h = headers.get('authorization');
  const m = h?.match(/^Bearer\s+(\S+)$/i);
  return m?.[1] ?? null;
}

/**
 * A session shaped like Better Auth's for a key or app, so every route reads `c.get('session').user.id` as it
 * always has. Its id says what it stands for (`key:…`, `app:…`); it is never stored.
 */
export function sessionFor(
  u: typeof schema.user.$inferSelect,
  id: string,
  times: { createdAt: Date; expiresAt: Date },
): Session {
  return {
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      emailVerified: u.emailVerified,
      image: u.image,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    },
    session: {
      id,
      userId: u.id,
      token: '',
      expiresAt: times.expiresAt,
      createdAt: times.createdAt,
      updatedAt: times.createdAt,
      ipAddress: null,
      userAgent: null,
    },
  } as unknown as Session;
}

/** Last used is written at most this often per key or app, so a busy client doesn't write on every call. */
export const TOUCH_MS = 60_000;

const via = new AsyncLocalStorage<string>();

/** Runs `fn` with changes it makes recorded in history as made through this key or app. */
export function withVia<T>(access: Access | undefined, fn: () => Promise<T>): Promise<T> {
  return access ? via.run(`${access.kind}:${access.name}`, fn) : fn();
}

/** "app:Claude", "key:Claude Code": how the change now being made came in; null when made in Tudu. */
export const currentVia = (): string | null => via.getStore() ?? null;
