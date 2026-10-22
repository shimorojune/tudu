import { Hono } from 'hono';
import { like, schema, type Db } from '@tudu/db';
import type { OutboxMailer } from '../email';
import type { Embeddings } from '../closeMatches';

/** Test-only routes, mounted under /__test when TEST_ROUTES=1. Never in production. */
export function testRoutes(outbox: OutboxMailer, db: Db, embeddings: Embeddings) {
  const r = new Hono();
  r.get('/outbox', (c) => {
    const to = c.req.query('to');
    return c.json({ mails: to ? outbox.to(to) : outbox.sent });
  });
  r.get('/outbox/code', (c) => {
    const to = c.req.query('to') ?? '';
    const last = outbox.to(to).at(-1);
    const code = last?.text.match(/\b(\d{6})\b/)?.[1] ?? null;
    return c.json({ code, at: last?.at ?? null });
  });
  /** Age every code sent to an address past its ten minutes. */
  r.post('/outbox/expire', async (c) => {
    const { email } = (await c.req.json()) as { email?: string };
    if (!email) return c.json({ error: 'email needed' }, 400);
    await db
      .update(schema.verification)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(like(schema.verification.identifier, `%${email}%`));
    return c.body(null, 204);
  });
  r.delete('/outbox', (c) => {
    outbox.clear();
    return c.body(null, 204);
  });
  /** Close matches: embed everything pending now (tests wait for this rather than the batch after a sync). */
  r.post('/embeddings/drain', async (c) => {
    const n = await embeddings.drain();
    return c.json({ embedded: n });
  });
  /** The model gone: the meaning search answers 503 until it is back up; for one person (`userId`) or everyone. */
  r.post('/embeddings/down', async (c) => {
    const { userId } = ((await c.req.json().catch(() => null)) ?? {}) as { userId?: string };
    if (userId) embeddings.downFor.add(userId);
    else embeddings.down = true;
    return c.body(null, 204);
  });
  r.post('/embeddings/up', async (c) => {
    const { userId } = ((await c.req.json().catch(() => null)) ?? {}) as { userId?: string };
    if (userId) embeddings.downFor.delete(userId);
    else embeddings.down = false;
    return c.body(null, 204);
  });
  return r;
}
