import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, schema, type Db } from '@tudu/db';
import { z } from 'zod';
import type { Session } from '../auth';
import { sessionFor, TOUCH_MS, type Access, type Reach } from './access';

/**
 * Apps: AI tools you allowed on the consent page (OAuth 2.1, `@better-auth/oauth-provider`). The plugin keeps the
 * clients, consents and tokens; what each app may reach is ours, in `oauth_grants`, one row per you and app.
 */

/** What the consent page posts: the same choices as a key, without expiry. */
export const reachSchema = z.object({
  level: z.enum(['read', 'write']),
  canDelete: z.boolean().optional(),
  spaces: z.array(z.string().min(1).max(64)).min(1).max(100).nullable().optional(),
  notebook: z.boolean().optional(),
});

/**
 * Apps Tudu can vouch for, known by where they send you back. A code only ever reaches its redirect, so an app
 * that calls itself "Claude" but sends you elsewhere stays Unverified, with its own name.
 */
const VERIFIED: Array<{ name: string; hosts: string[]; icon: string | null }> = [
  {
    name: 'Claude',
    hosts: ['claude.ai', 'claude.com'],
    icon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cg%20stroke%3D%22%23D97757%22%20stroke-width%3D%222.6%22%20stroke-linecap%3D%22round%22%3E%3Cline%20x1%3D%2212%22%20y1%3D%2212%22%20x2%3D%2221.41%22%20y2%3D%2213.32%22/%3E%3Cline%20x1%3D%2212%22%20y1%3D%2212%22%20x2%3D%2217.67%22%20y2%3D%2216.43%22/%3E%3Cline%20x1%3D%2212%22%20y1%3D%2212%22%20x2%3D%2215.37%22%20y2%3D%2220.34%22/%3E%3Cline%20x1%3D%2212%22%20y1%3D%2212%22%20x2%3D%2210.91%22%20y2%3D%2219.72%22/%3E%3Cline%20x1%3D%2212%22%20y1%3D%2212%22%20x2%3D%225.97%22%20y2%3D%2219.72%22/%3E%3Cline%20x1%3D%2212%22%20y1%3D%2212%22%20x2%3D%225.51%22%20y2%3D%2214.62%22/%3E%3Cline%20x1%3D%2212%22%20y1%3D%2212%22%20x2%3D%222.89%22%20y2%3D%2210.72%22/%3E%3Cline%20x1%3D%2212%22%20y1%3D%2212%22%20x2%3D%226.01%22%20y2%3D%227.32%22/%3E%3Cline%20x1%3D%2212%22%20y1%3D%2212%22%20x2%3D%228.40%22%20y2%3D%223.10%22/%3E%3Cline%20x1%3D%2212%22%20y1%3D%2212%22%20x2%3D%2213.02%22%20y2%3D%224.77%22/%3E%3Cline%20x1%3D%2212%22%20y1%3D%2212%22%20x2%3D%2217.48%22%20y2%3D%224.99%22/%3E%3Cline%20x1%3D%2212%22%20y1%3D%2212%22%20x2%3D%2219.32%22%20y2%3D%229.04%22/%3E%3C/g%3E%3C/svg%3E',
  },
  { name: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com'], icon: null },
  { name: 'Cursor', hosts: ['cursor:'], icon: null },
];

type Client = typeof schema.oauthClient.$inferSelect;

/** Where an app sends you back: a host, or the scheme for apps on your computer (`cursor:`). */
function hostOf(uri: string | undefined): string | null {
  if (!uri) return null;
  try {
    const u = new URL(uri);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname : u.protocol;
  } catch {
    return null;
  }
}

/** How Tudu shows an app: verified apps by the name and mark Tudu knows, the rest by what they registered. */
export function describeClient(client: Pick<Client, 'clientId' | 'name' | 'icon' | 'redirectUris'>): {
  name: string;
  verified: boolean;
  icon: string | null;
  host: string | null;
} {
  const hosts = client.redirectUris.map(hostOf).filter((h): h is string => !!h);
  const known = VERIFIED.find((v) => hosts.length > 0 && hosts.every((h) => v.hosts.includes(h)));
  const host = hosts[0] ?? null;
  if (known) return { name: known.name, verified: true, icon: known.icon ?? client.icon ?? null, host };
  return { name: client.name?.trim() || host || 'An app', verified: false, icon: null, host };
}

/** The plugin keeps tokens as unpadded base64url SHA-256 of the token without its prefix. */
export const tokenHash = (token: string, prefix: string) =>
  createHash('sha256').update(token.slice(prefix.length)).digest('base64url');

/**
 * The person and access behind an app's access token, or null when it is unknown, revoked, expired, meant for
 * another resource, or has no grant (the app was disconnected).
 */
export async function sessionFromAppToken(
  db: Db,
  token: string,
  opts: { prefix: string; resource: string },
): Promise<{ session: Session; access: Access } | null> {
  const [hit] = await db
    .select({
      token: schema.oauthAccessToken,
      user: schema.user,
      grant: schema.oauthGrants,
      client: schema.oauthClient,
    })
    .from(schema.oauthAccessToken)
    .innerJoin(schema.user, eq(schema.user.id, schema.oauthAccessToken.userId))
    .innerJoin(schema.oauthClient, eq(schema.oauthClient.clientId, schema.oauthAccessToken.clientId))
    .innerJoin(
      schema.oauthGrants,
      and(
        eq(schema.oauthGrants.userId, schema.oauthAccessToken.userId),
        eq(schema.oauthGrants.clientId, schema.oauthAccessToken.clientId),
      ),
    )
    .where(eq(schema.oauthAccessToken.token, tokenHash(token, opts.prefix)));
  if (!hit || hit.token.revoked || hit.client.disabled) return null;
  const now = new Date();
  if (hit.token.expiresAt <= now) return null;
  // RFC 8707: a token asked for another resource isn't ours to honour. One asked for none is for Tudu only.
  const resources = hit.token.resources ?? [];
  if (resources.length && !resources.includes(opts.resource)) return null;
  if (!hit.grant.lastUsedAt || now.getTime() - hit.grant.lastUsedAt.getTime() > TOUCH_MS)
    await db
      .update(schema.oauthGrants)
      .set({ lastUsedAt: now })
      .where(eq(schema.oauthGrants.id, hit.grant.id));
  const app = describeClient(hit.client);
  return {
    session: sessionFor(hit.user, `app:${hit.client.clientId}`, {
      createdAt: hit.token.createdAt,
      expiresAt: hit.token.expiresAt,
    }),
    access: {
      kind: 'app',
      id: hit.client.clientId,
      name: app.name,
      level: hit.grant.level,
      canDelete: hit.grant.canDelete,
      spaces: hit.grant.spaces ?? null,
      notebook: hit.grant.notebook,
    },
  };
}

/** An app's row as Settings lists it. */
export interface AppRow extends Reach {
  clientId: string;
  name: string;
  verified: boolean;
  icon: string | null;
  host: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export async function listApps(db: Db, userId: string): Promise<AppRow[]> {
  const rows = await db
    .select({ grant: schema.oauthGrants, client: schema.oauthClient })
    .from(schema.oauthGrants)
    .innerJoin(schema.oauthClient, eq(schema.oauthClient.clientId, schema.oauthGrants.clientId))
    .where(eq(schema.oauthGrants.userId, userId))
    .orderBy(desc(schema.oauthGrants.createdAt));
  return rows.map(({ grant, client }) => ({
    clientId: client.clientId,
    ...describeClient(client),
    level: grant.level,
    canDelete: grant.canDelete,
    spaces: grant.spaces ?? null,
    notebook: grant.notebook,
    lastUsedAt: grant.lastUsedAt?.toISOString() ?? null,
    createdAt: grant.createdAt.toISOString(),
  }));
}

/** Checks the spaces are yours; throws a sentence when not. Null (every space) always passes. */
export async function assertMySpaces(db: Db, userId: string, spaces: string[] | null): Promise<void> {
  if (!spaces) return;
  const inThem = await db
    .select({ id: schema.spaceMembers.spaceId })
    .from(schema.spaceMembers)
    .where(and(eq(schema.spaceMembers.userId, userId), inArray(schema.spaceMembers.spaceId, spaces)));
  if (inThem.length !== new Set(spaces).size) throw new NotYours();
}

export class NotYours extends Error {
  constructor() {
    super('You’re not in one of those spaces.');
  }
}

/** Keeps what you chose on the consent page for this app, replacing an earlier choice. */
export async function saveGrant(
  db: Db,
  userId: string,
  clientId: string,
  input: z.infer<typeof reachSchema>,
): Promise<void> {
  const spaces = input.spaces ?? null;
  await assertMySpaces(db, userId, spaces);
  const reach = {
    level: input.level,
    canDelete: input.level === 'write' && !!input.canDelete,
    spaces,
    notebook: input.notebook ?? true,
  };
  await db
    .insert(schema.oauthGrants)
    .values({ id: randomUUID(), userId, clientId, ...reach })
    .onConflictDoUpdate({ target: [schema.oauthGrants.userId, schema.oauthGrants.clientId], set: reach });
}

/**
 * Disconnects an app: its tokens stop at once, the consent goes (so it asks again next time) and so does the grant.
 * False when you hadn't connected it.
 */
export async function revokeApp(db: Db, userId: string, clientId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const gone = await tx
      .delete(schema.oauthGrants)
      .where(and(eq(schema.oauthGrants.userId, userId), eq(schema.oauthGrants.clientId, clientId)))
      .returning({ id: schema.oauthGrants.id });
    const now = new Date();
    await tx
      .update(schema.oauthAccessToken)
      .set({ revoked: now })
      .where(
        and(
          eq(schema.oauthAccessToken.userId, userId),
          eq(schema.oauthAccessToken.clientId, clientId),
          isNull(schema.oauthAccessToken.revoked),
        ),
      );
    await tx
      .update(schema.oauthRefreshToken)
      .set({ revoked: now })
      .where(
        and(
          eq(schema.oauthRefreshToken.userId, userId),
          eq(schema.oauthRefreshToken.clientId, clientId),
          isNull(schema.oauthRefreshToken.revoked),
        ),
      );
    await tx
      .delete(schema.oauthConsent)
      .where(and(eq(schema.oauthConsent.userId, userId), eq(schema.oauthConsent.clientId, clientId)));
    return gone.length > 0;
  });
}

/** The client behind a signed authorize request, for the consent page. */
export async function clientOf(db: Db, clientId: string): Promise<Client | null> {
  const [row] = await db.select().from(schema.oauthClient).where(eq(schema.oauthClient.clientId, clientId));
  return row ?? null;
}
