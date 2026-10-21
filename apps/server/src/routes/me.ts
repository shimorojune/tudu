import { Hono } from 'hono';
import { eq, schema, type Db } from '@tudu/db';
import { requireSession, type SessionVars } from '../middleware/session';
import { colourOf, spaceSummaries } from '../spaces';

/** Who you are and the spaces you are in. */
export function meRoutes(db: Db) {
  const r = new Hono<{ Variables: SessionVars }>();
  r.get('/me', requireSession, async (c) => {
    const session = c.get('session')!;
    const [row] = await db
      .select({ color: schema.user.color })
      .from(schema.user)
      .where(eq(schema.user.id, session.user.id));
    // Someone from before colours were given gets theirs the first time they ask.
    const color = row?.color ?? (await colourOf(db, session.user.id));
    return c.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image ?? null,
        color,
      },
      spaces: await spaceSummaries(db, session.user.id),
    });
  });
  return r;
}
