import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, schema, type Db } from '@tudu/db';
import { z } from 'zod';
import type { Session } from './auth';

/**
 * Keys for using Tudu from other tools: an MCP client, a script. A key is `tudu_` and 32 random bytes; only its
 * SHA-256 is stored. It acts as you, narrowed by what it was made for (see `KeyAccess`).
 *
 * PROTOTYPE (MCP try-out branch): not reviewed, no tests yet. See docs/plans once the proposal is approved.
 */
export const KEY_PREFIX = 'tudu_';
/** Keys made without a date run out after this many days. */
export const KEY_DEFAULT_DAYS = 90;
/** Last used is written at most this often per key, so a busy client doesn't write on every call. */
const TOUCH_MS = 60_000;

export interface KeyAccess {
  kind: 'key';
  keyId: string;
  name: string;
  level: 'read' | 'write';
  canDelete: boolean;
  /** Null: every space you are in. */
  spaces: string[] | null;
  notebook: boolean;
}

export const newKeySchema = z.object({
  name: z.string().trim().min(1).max(60),
  level: z.enum(['read', 'write']),
  canDelete: z.boolean().optional(),
  spaces: z.array(z.string().min(1).max(64)).min(1).max(100).nullable().optional(),
  notebook: z.boolean().optional(),
  /** Days until it runs out; null never. */
  days: z.number().int().min(1).max(365).nullable().optional(),
});

const hashOf = (key: string) => createHash('sha256').update(key).digest('hex');

export function looksLikeKey(bearer: string | undefined | null): bearer is string {
  return !!bearer && bearer.startsWith(KEY_PREFIX) && bearer.length > KEY_PREFIX.length + 20;
}

export function bearerOf(headers: Headers): string | null {
  const h = headers.get('authorization');
  const m = h?.match(/^Bearer\s+(\S+)$/i);
  return m?.[1] ?? null;
}

/** A key's row as Settings lists it. Never the key itself. */
export interface KeyRow {
  id: string;
  name: string;
  start: string;
  level: 'read' | 'write';
  canDelete: boolean;
  spaces: string[] | null;
  notebook: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  state: 'active' | 'expired';
}

type Row = typeof schema.apiKeys.$inferSelect;
const rowOf = (r: Row, now = new Date()): KeyRow => ({
  id: r.id,
  name: r.name,
  start: r.start,
  level: r.level,
  canDelete: r.canDelete,
  spaces: r.spaces ?? null,
  notebook: r.notebook,
  expiresAt: r.expiresAt?.toISOString() ?? null,
  lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  state: r.expiresAt && r.expiresAt <= now ? 'expired' : 'active',
});

export class KeyRejected extends Error {
  constructor(
    readonly status: 400 | 403 | 409,
    message: string,
  ) {
    super(message);
  }
}

export async function listKeys(db: Db, userId: string): Promise<KeyRow[]> {
  const rows = await db
    .select()
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt)))
    .orderBy(desc(schema.apiKeys.createdAt));
  return rows.map((r) => rowOf(r));
}

/** Makes a key and returns it once, with its row. */
export async function createKey(
  db: Db,
  userId: string,
  input: z.infer<typeof newKeySchema>,
): Promise<{ key: string; row: KeyRow }> {
  const mine = await listKeys(db, userId);
  if (mine.some((k) => k.name.toLowerCase() === input.name.toLowerCase()))
    throw new KeyRejected(409, 'You already have a key with that name.');
  const spaces = input.spaces ?? null;
  if (spaces) {
    const inThem = await db
      .select({ id: schema.spaceMembers.spaceId })
      .from(schema.spaceMembers)
      .where(and(eq(schema.spaceMembers.userId, userId), inArray(schema.spaceMembers.spaceId, spaces)));
    if (inThem.length !== new Set(spaces).size) throw new KeyRejected(403, 'You’re not in one of those spaces.');
  }
  const key = KEY_PREFIX + randomBytes(32).toString('base64url');
  const days = input.days === undefined ? KEY_DEFAULT_DAYS : input.days;
  const [row] = await db
    .insert(schema.apiKeys)
    .values({
      id: randomUUID(),
      userId,
      name: input.name,
      start: key.slice(0, KEY_PREFIX.length + 4),
      hash: hashOf(key),
      level: input.level,
      canDelete: input.level === 'write' && !!input.canDelete,
      spaces,
      notebook: input.notebook ?? true,
      expiresAt: days === null ? null : new Date(Date.now() + days * 86_400_000),
    })
    .returning();
  return { key, row: rowOf(row!) };
}

export async function revokeKey(db: Db, userId: string, id: string): Promise<boolean> {
  const out = await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt)),
    )
    .returning({ id: schema.apiKeys.id });
  return out.length > 0;
}

/**
 * The person and access behind a key, or null when it is unknown, revoked or expired. The session is shaped like
 * Better Auth's, so every route reads `c.get('session').user.id` as it always has.
 */
export async function sessionFromKey(
  db: Db,
  key: string,
): Promise<{ session: Session; access: KeyAccess } | null> {
  const [hit] = await db
    .select({ key: schema.apiKeys, user: schema.user })
    .from(schema.apiKeys)
    .innerJoin(schema.user, eq(schema.user.id, schema.apiKeys.userId))
    .where(and(eq(schema.apiKeys.hash, hashOf(key)), isNull(schema.apiKeys.revokedAt)));
  if (!hit) return null;
  const now = new Date();
  if (hit.key.expiresAt && hit.key.expiresAt <= now) return null;
  if (!hit.key.lastUsedAt || now.getTime() - hit.key.lastUsedAt.getTime() > TOUCH_MS)
    await db.update(schema.apiKeys).set({ lastUsedAt: now }).where(eq(schema.apiKeys.id, hit.key.id));
  const u = hit.user;
  const session = {
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
      id: `key:${hit.key.id}`,
      userId: u.id,
      token: '',
      expiresAt: hit.key.expiresAt ?? new Date(now.getTime() + 365 * 86_400_000),
      createdAt: hit.key.createdAt,
      updatedAt: hit.key.createdAt,
      ipAddress: null,
      userAgent: null,
    },
  } as unknown as Session;
  return {
    session,
    access: {
      kind: 'key',
      keyId: hit.key.id,
      name: hit.key.name,
      level: hit.key.level,
      canDelete: hit.key.canDelete,
      spaces: hit.key.spaces ?? null,
      notebook: hit.key.notebook,
    },
  };
}
