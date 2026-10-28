import { Hono } from 'hono';
import type { Db } from '@tudu/db';
import { createKey, KeyRejected, listKeys, newKeySchema, revokeKey } from '../apiKeys';
import { requireSession, requireSignIn, type SessionVars } from '../middleware/session';

/** Settings › AI access: your keys. Made, listed and revoked only when signed in, never with a key. */
export function keyRoutes(db: Db) {
  const r = new Hono<{ Variables: SessionVars }>();

  r.get('/keys', requireSignIn, async (c) => c.json({ keys: await listKeys(db, c.get('session')!.user.id) }));

  r.post('/keys', requireSignIn, async (c) => {
    const parsed = newKeySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Give the key a name and an access level.' }, 400);
    try {
      return c.json(await createKey(db, c.get('session')!.user.id, parsed.data), 201);
    } catch (err) {
      if (err instanceof KeyRejected) return c.json({ error: err.message }, err.status);
      throw err;
    }
  });

  r.delete('/keys/:id', requireSignIn, async (c) => {
    const done = await revokeKey(db, c.get('session')!.user.id, c.req.param('id'));
    return done ? c.body(null, 204) : c.json({ error: 'That key isn’t there any more.' }, 404);
  });

  /** Who this is and how far it reaches: the MCP server asks this to check a key. */
  r.get('/access', requireSession, (c) => {
    const s = c.get('session')!;
    return c.json({
      user: { id: s.user.id, name: s.user.name, email: s.user.email },
      access: c.get('access') ?? { kind: 'session' },
    });
  });

  return r;
}
