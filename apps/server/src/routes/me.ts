import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { PHOTO_MAX_BYTES } from '@tudu/core';
import { eq, schema, type Db } from '@tudu/db';
import { clearPhoto, confirmEmailChange, readPhoto, setPhoto, startEmailChange } from '../account';
import type { Mailer } from '../email';
import { gettingStarted, isFirstSession, parseRecord, recordFirstRun } from '../firstRun';
import type { EventHub } from '../events';
import { requireSession, type SessionVars } from '../middleware/session';
import { inboxCounts } from '../requests';
import { colourOf, SpaceError, spaceSummaries } from '../spaces';
import type { Storage } from '../storage';
import { announceMembers } from './spaces';

/** Who you are and the spaces you are in; your photo and your email. */
export function meRoutes(db: Db, hub: EventHub, mailer: Mailer, storage: Storage) {
  const r = new Hono<{ Variables: SessionVars }>();
  const fail = (c: { json: (b: unknown, s: number) => Response }, err: unknown) => {
    if (err instanceof SpaceError) return c.json({ error: err.message, ...err.body }, err.status);
    throw err;
  };
  /** Everyone who shares a space with you sees your name, photo and email: tell them. */
  const tellSpaces = async (userId: string) => {
    for (const s of await spaceSummaries(db, userId)) await announceMembers(db, hub, s.id);
  };

  r.get('/me', requireSession, async (c) => {
    const session = c.get('session')!;
    const [row] = await db
      .select({ color: schema.user.color, image: schema.user.image, createdAt: schema.user.createdAt })
      .from(schema.user)
      .where(eq(schema.user.id, session.user.id));
    // Someone from before colours were given gets theirs the first time they ask.
    const color = row?.color ?? (await colourOf(db, session.user.id));
    return c.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: row?.image ?? null,
        color,
        createdAt: (row?.createdAt ?? new Date(session.user.createdAt)).toISOString(),
      },
      /** This session is the sign-in that made the account: a new person, not a returning one. */
      firstSignIn: await isFirstSession(db, session.user.id, session.session.id),
      gettingStarted: await gettingStarted(db, session.user.id),
      spaces: await (async () => {
        const counts = await inboxCounts(db, session.user.id);
        return (await spaceSummaries(db, session.user.id)).map((s) => ({
          ...s,
          inbox: counts.get(s.id) ?? { toAnswer: 0, unread: 0 },
        }));
      })(),
    });
  });

  r.post('/me/getting-started', requireSession, async (c) => {
    const rec = parseRecord(await c.req.json().catch(() => null));
    if (!rec) return c.json({ error: 'Send { theme: true } or { hidden: true }.' }, 400);
    const userId = c.get('session')!.user.id;
    await recordFirstRun(db, userId, rec);
    return c.json({ gettingStarted: await gettingStarted(db, userId) });
  });

  r.post('/me/photo', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const length = Number(c.req.header('content-length') ?? 0);
    if (length > PHOTO_MAX_BYTES + 4096)
      return c.json({ error: 'That photo is too big. Photos can be up to 5 MB.' }, 413);
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: 'Send the photo as form data.' }, 400);
    }
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) return c.json({ error: 'No photo came through.' }, 400);
    try {
      const image = await setPhoto(db, storage, userId, new Uint8Array(await file.arrayBuffer()));
      await tellSpaces(userId);
      return c.json({ image });
    } catch (err) {
      return fail(c, err);
    }
  });

  r.delete('/me/photo', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    await clearPhoto(db, storage, userId);
    await tellSpaces(userId);
    return c.body(null, 204);
  });

  r.get('/people/:userId/photo/:v', requireSession, async (c) => {
    const viewer = c.get('session')!.user.id;
    const { userId, v } = c.req.param();
    const obj = await readPhoto(db, storage, viewer, userId, v);
    if (!obj) return c.json({ error: 'No such photo.' }, 404);
    c.header('content-type', obj.type);
    c.header('content-length', String(obj.size));
    // A new photo is a new address, so this one never changes.
    c.header('cache-control', 'private, max-age=31536000, immutable');
    c.header('x-content-type-options', 'nosniff');
    return stream(c, async (s) => {
      for await (const chunk of obj.body) await s.write(chunk as Uint8Array);
    });
  });

  r.post('/me/email', requireSession, async (c) => {
    const user = c.get('session')!.user;
    const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null;
    if (typeof body?.email !== 'string') return c.json({ error: 'Give the new address.' }, 400);
    try {
      return c.json({ email: await startEmailChange(db, mailer, user, body.email) });
    } catch (err) {
      return fail(c, err);
    }
  });

  r.post('/me/email/confirm', requireSession, async (c) => {
    const user = c.get('session')!.user;
    const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
    if (typeof body?.code !== 'string' || !/^\d{6}$/.test(body.code.trim()))
      return c.json({ error: 'The code is six digits.' }, 400);
    try {
      const email = await confirmEmailChange(db, mailer, user, body.code);
      await tellSpaces(user.id);
      return c.json({ email });
    } catch (err) {
      return fail(c, err);
    }
  });

  return r;
}
