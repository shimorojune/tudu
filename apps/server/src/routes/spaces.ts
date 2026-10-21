import { Hono } from 'hono';
import { z } from 'zod';
import {
  EMAIL_PATTERN,
  isIsoDate,
  diffDays,
  MEMBERS_CHANGED,
  SPACE_GONE,
  spaceColorSchema,
  spaceNameSchema,
  type MembersChangedEvent,
  type MembersResponse,
  type SpaceGoneEvent,
  INBOX_CHANGED,
  type InboxChangedEvent,
} from '@tudu/core';
import { eq, schema, type Db } from '@tudu/db';
import type { Mailer } from '../email';
import type { EventHub } from '../events';
import { requireSession, type SessionVars } from '../middleware/session';
import {
  cancelInvite,
  createSpace,
  invite,
  join,
  joinInfo,
  membersDetail,
  pendingInvites,
  peopleOf,
  personOf,
  restoreInvite,
  SpaceError,
} from '../spaces';
import { deleteSpace, leaveSpace, nameOf, removeMember, restoreMember, setRole } from '../settings';
import type { Storage } from '../storage';
import { membersOf, roleIn } from '../tasks';

/** Tell everyone in a space that who is in it (or invited) changed. */
export async function announceMembers(db: Db, hub: EventHub, spaceId: string): Promise<void> {
  const event: MembersChangedEvent = { spaceId };
  for (const userId of await membersOf(db, spaceId)) hub.publish(userId, MEMBERS_CHANGED, event);
}

const createSchema = z.object({
  name: spaceNameSchema,
  color: spaceColorSchema,
  invites: z.array(z.string().trim().toLowerCase()).max(50).optional(),
});
const inviteSchema = z.object({ emails: z.array(z.string().trim().toLowerCase()).min(1).max(50) });

/** At most this many days of shared tasks in one People read. */
const PEOPLE_SPAN = 31;

/** Spaces: making one, inviting and joining, who is in it, and People. */
export function spaceRoutes(db: Db, hub: EventHub, mailer: Mailer, webUrl: string, storage: Storage) {
  const r = new Hono<{ Variables: SessionVars }>();
  const fail = (c: { json: (b: unknown, s: number) => Response }, err: unknown) => {
    if (err instanceof SpaceError) return c.json({ error: err.message, ...err.body }, err.status);
    throw err;
  };

  r.post('/spaces', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: parsed.error.issues[0]?.message ?? 'That space is not valid.' }, 400);
    const space = await createSpace(db, userId, parsed.data);
    const emails = (parsed.data.invites ?? []).filter((e) => EMAIL_PATTERN.test(e));
    let sent: string[] = [];
    if (emails.length) sent = (await invite(db, mailer, webUrl, userId, space.id, emails)).sent;
    await announceMembers(db, hub, space.id);
    return c.json({ space, invited: sent }, 201);
  });

  r.get('/spaces/:spaceId/members', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    const body: MembersResponse = {
      members: await membersDetail(db, spaceId),
      invites: await pendingInvites(db, spaceId),
    };
    return c.json(body);
  });

  r.post('/spaces/:spaceId/invites', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    const parsed = inviteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Give at least one email address.' }, 400);
    const bad = parsed.data.emails.find((e) => !EMAIL_PATTERN.test(e));
    if (bad) return c.json({ error: `“${bad}” isn’t an email address.` }, 400);
    try {
      const out = await invite(db, mailer, webUrl, userId, spaceId, parsed.data.emails);
      await announceMembers(db, hub, spaceId);
      return c.json({ results: out.results, invites: out.invites });
    } catch (err) {
      return fail(c, err);
    }
  });

  r.delete('/invites/:id', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    try {
      const spaceId = await cancelInvite(db, userId, c.req.param('id'));
      await announceMembers(db, hub, spaceId);
      return c.body(null, 204);
    } catch (err) {
      return fail(c, err);
    }
  });

  r.post('/invites/:id/restore', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    try {
      const spaceId = await restoreInvite(db, userId, c.req.param('id'));
      await announceMembers(db, hub, spaceId);
      return c.json({ invites: await pendingInvites(db, spaceId) });
    } catch (err) {
      return fail(c, err);
    }
  });

  /** Tell senders their requests came back, and the person who went that the space is gone for them. */
  const afterDeparture = async (
    spaceId: string,
    gone: string,
    how: 'left' | 'removed',
    by: string,
    told: string[],
  ) => {
    const [space] = await db
      .select({ name: schema.spaces.name })
      .from(schema.spaces)
      .where(eq(schema.spaces.id, spaceId));
    const event: SpaceGoneEvent = {
      spaceId,
      name: space?.name ?? '',
      how,
      by: how === 'removed' ? await nameOf(db, by) : null,
    };
    hub.publish(gone, SPACE_GONE, event);
    for (const u of told) hub.publish(u, INBOX_CHANGED, { spaceId } satisfies InboxChangedEvent);
    await announceMembers(db, hub, spaceId);
  };

  r.patch('/spaces/:spaceId/members/:userId', requireSession, async (c) => {
    const me = c.get('session')!.user.id;
    const { spaceId, userId } = c.req.param();
    const body = (await c.req.json().catch(() => null)) as { role?: unknown } | null;
    if (body?.role !== 'admin' && body?.role !== 'member')
      return c.json({ error: 'A role is admin or member.' }, 400);
    try {
      await setRole(db, me, spaceId, userId, body.role);
      await announceMembers(db, hub, spaceId);
      return c.json({ members: await membersDetail(db, spaceId) });
    } catch (err) {
      return fail(c, err);
    }
  });

  r.delete('/spaces/:spaceId/members/:userId', requireSession, async (c) => {
    const me = c.get('session')!.user.id;
    const { spaceId, userId } = c.req.param();
    try {
      const out = await removeMember(db, me, spaceId, userId);
      await afterDeparture(spaceId, userId, 'removed', me, out.told);
      return c.body(null, 204);
    } catch (err) {
      return fail(c, err);
    }
  });

  r.post('/spaces/:spaceId/members/:userId/restore', requireSession, async (c) => {
    const me = c.get('session')!.user.id;
    const { spaceId, userId } = c.req.param();
    try {
      const told = await restoreMember(db, me, spaceId, userId);
      for (const u of told) hub.publish(u, INBOX_CHANGED, { spaceId } satisfies InboxChangedEvent);
      await announceMembers(db, hub, spaceId);
      return c.json({ members: await membersDetail(db, spaceId) });
    } catch (err) {
      return fail(c, err);
    }
  });

  r.post('/spaces/:spaceId/leave', requireSession, async (c) => {
    const me = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    try {
      const out = await leaveSpace(db, me, spaceId);
      await afterDeparture(spaceId, me, 'left', me, out.told);
      return c.body(null, 204);
    } catch (err) {
      return fail(c, err);
    }
  });

  r.delete('/spaces/:spaceId', requireSession, async (c) => {
    const me = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    try {
      const out = await deleteSpace(db, storage, me, spaceId);
      for (const u of out.members) hub.publish(u, SPACE_GONE, out.event);
      return c.body(null, 204);
    } catch (err) {
      return fail(c, err);
    }
  });

  /** What a join link leads to. Open to anyone with the link; a signed-in person hears whether it is theirs. */
  r.get('/join/:token', async (c) => {
    const session = c.get('session');
    try {
      const info = await joinInfo(
        db,
        c.req.param('token'),
        session ? { id: session.user.id, email: session.user.email } : null,
      );
      // A dead link's 410 is one of the answers a browser may keep without being told: never keep this one.
      c.header('cache-control', 'no-store');
      return c.json(info, info.state === 'open' || info.you?.member ? 200 : 410);
    } catch (err) {
      return fail(c, err);
    }
  });

  r.post('/join/:token', requireSession, async (c) => {
    const session = c.get('session')!;
    try {
      const out = await join(db, c.req.param('token'), { id: session.user.id, email: session.user.email });
      if (out.joined) await announceMembers(db, hub, out.space.id);
      return c.json(out);
    } catch (err) {
      return fail(c, err);
    }
  });

  /** People: everyone's shared tasks between two days (a month at most), by member. */
  r.get('/spaces/:spaceId/people', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!isIsoDate(from) || !isIsoDate(to) || diffDays(from, to) < 0 || diffDays(from, to) > PEOPLE_SPAN)
      return c.json({ error: 'Ask for a range of up to a month.' }, 400);
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    return c.json(await peopleOf(db, spaceId, userId, from, to));
  });

  r.get('/spaces/:spaceId/people/:userId', requireSession, async (c) => {
    const me = c.get('session')!.user.id;
    const { spaceId, userId } = c.req.param();
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!isIsoDate(from) || !isIsoDate(to) || diffDays(from, to) < 0 || diffDays(from, to) > PEOPLE_SPAN)
      return c.json({ error: 'Ask for a range of up to a month.' }, 400);
    if (!(await roleIn(db, me, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
    const person = await personOf(db, spaceId, me, userId, from, to);
    if (!person) return c.json({ error: 'No one by that name in this space.' }, 404);
    return c.json(person);
  });

  return r;
}
