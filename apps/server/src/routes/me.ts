import { Hono } from 'hono';
import { eq, schema, type Db } from '@tudu/db';
import { requireSession, type SessionVars } from '../middleware/session';

/** Who you are and the spaces you are in. */
export function meRoutes(db: Db) {
  const r = new Hono<{ Variables: SessionVars }>();
  r.get('/me', requireSession, async (c) => {
    const session = c.get('session')!;
    const rows = await db
      .select({
        id: schema.spaces.id,
        kind: schema.spaces.kind,
        name: schema.spaces.name,
        color: schema.spaces.color,
        role: schema.spaceMembers.role,
      })
      .from(schema.spaceMembers)
      .innerJoin(schema.spaces, eq(schema.spaces.id, schema.spaceMembers.spaceId))
      .where(eq(schema.spaceMembers.userId, session.user.id))
      .orderBy(schema.spaces.kind, schema.spaces.name);
    return c.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image ?? null,
      },
      spaces: rows,
    });
  });
  return r;
}
