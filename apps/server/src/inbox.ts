import { randomUUID } from 'node:crypto';
import {
  filterInbox,
  filterSent,
  INVITE_DAYS,
  spaceInitials,
  type InboxCounts,
  type InboxItem,
  type InboxResponse,
  type InboxSpace,
  type InboxView,
} from '@tudu/core';
import { and, desc, eq, gt, inArray, isNull, lt, ne, schema, sql, type Db } from '@tudu/db';
import { person, requestsWhere, type Executor } from './requests';
import { slugOf, stateOf } from './spaces';

/** Cleared items are kept this long for Undo and then swept. */
export const CLEARED_KEEP_MS = 30 * 86_400_000;

/** The spaces a person is in, as Inbox rows name them. */
async function spacesOf(db: Executor, userId: string): Promise<Map<string, InboxSpace>> {
  const rows = await db
    .select({
      id: schema.spaces.id,
      kind: schema.spaces.kind,
      name: schema.spaces.name,
      color: schema.spaces.color,
      slug: schema.spaces.slug,
    })
    .from(schema.spaceMembers)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.spaceMembers.spaceId))
    .where(eq(schema.spaceMembers.userId, userId));
  return new Map(
    rows.map((r) => [r.id, { id: r.id, kind: r.kind, name: r.name, color: r.color, slug: slugOf(r) }]),
  );
}

/**
 * Invites to this person's email that are still open get an Inbox item, once each: on the next read after they are
 * sent, which covers someone who signed up after being invited. A fresh send of an invite that was put away with Not
 * now brings it back, new.
 */
export async function ensureInvites(db: Executor, user: { id: string; email: string }): Promise<void> {
  const since = new Date(Date.now() - INVITE_DAYS * 86_400_000);
  const open = await db
    .select({
      id: schema.spaceInvites.id,
      spaceId: schema.spaceInvites.spaceId,
      sentAt: schema.spaceInvites.sentAt,
      name: schema.spaces.name,
    })
    .from(schema.spaceInvites)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.spaceInvites.spaceId))
    .leftJoin(
      schema.spaceMembers,
      and(
        eq(schema.spaceMembers.spaceId, schema.spaceInvites.spaceId),
        eq(schema.spaceMembers.userId, user.id),
      ),
    )
    .where(
      and(
        sql`lower(${schema.spaceInvites.email}) = ${user.email.toLowerCase()}`,
        isNull(schema.spaceInvites.acceptedAt),
        isNull(schema.spaceInvites.cancelledAt),
        gt(schema.spaceInvites.sentAt, since),
        isNull(schema.spaceMembers.userId),
      ),
    );
  if (!open.length) return;
  await db
    .insert(schema.inboxItems)
    .values(
      open.map((i) => ({
        id: randomUUID(),
        userId: user.id,
        spaceId: i.spaceId,
        spaceName: i.name,
        kind: 'invite' as const,
        inviteId: i.id,
        createdAt: i.sentAt,
      })),
    )
    .onConflictDoNothing({ target: [schema.inboxItems.userId, schema.inboxItems.inviteId] });
  for (const i of open)
    await db
      .update(schema.inboxItems)
      .set({ clearedAt: null, readAt: null, createdAt: i.sentAt })
      .where(
        and(
          eq(schema.inboxItems.userId, user.id),
          eq(schema.inboxItems.inviteId, i.id),
          lt(schema.inboxItems.createdAt, i.sentAt),
        ),
      );
}

/** A notice that a space went away for someone: removed from it, or it was deleted. */
export async function noteSpaceGone(
  db: Executor,
  users: string[],
  space: { id: string; name: string },
  type: 'removed' | 'deleted',
  by: string | null,
): Promise<string[]> {
  if (!users.length) return [];
  const ids = users.map(() => randomUUID());
  await db.insert(schema.inboxItems).values(
    users.map((u, n) => ({
      id: ids[n]!,
      userId: u,
      spaceId: space.id,
      spaceName: space.name,
      kind: 'notice' as const,
      notice: { type, by },
    })),
  );
  return ids;
}

/** Put back a removal: its notice goes, since the person is in the space again. */
export async function forgetRemoval(db: Executor, userId: string, spaceId: string): Promise<void> {
  await db
    .delete(schema.inboxItems)
    .where(
      and(
        eq(schema.inboxItems.userId, userId),
        eq(schema.inboxItems.spaceId, spaceId),
        eq(schema.inboxItems.kind, 'notice'),
        sql`${schema.inboxItems.notice}->>'type' = 'removed'`,
      ),
    );
}

/** Items cleared more than 30 days ago are gone for good. */
export async function sweepCleared(db: Db, now = Date.now()): Promise<void> {
  await db.delete(schema.inboxItems).where(lt(schema.inboxItems.clearedAt, new Date(now - CLEARED_KEEP_MS)));
}

type Row = typeof schema.inboxItems.$inferSelect;

/** The rows this person sees: every space they are in, plus invites and notices, never cleared ones. */
async function rowsOf(db: Executor, userId: string, spaces: Map<string, InboxSpace>): Promise<Row[]> {
  const rows = await db
    .select()
    .from(schema.inboxItems)
    .where(and(eq(schema.inboxItems.userId, userId), isNull(schema.inboxItems.clearedAt)))
    .orderBy(desc(schema.inboxItems.createdAt));
  return rows.filter(
    (r) => r.kind === 'invite' || r.kind === 'notice' || (r.spaceId !== null && spaces.has(r.spaceId)),
  );
}

/** Build the items, dropping ones whose request, comment or invite is gone. */
async function itemsOf(db: Executor, rows: Row[], spaces: Map<string, InboxSpace>): Promise<InboxItem[]> {
  const reqIds = [...new Set(rows.map((i) => i.requestId).filter((x): x is string => !!x))];
  const requests = reqIds.length ? await requestsWhere(db, and(inArray(schema.requests.id, reqIds))) : [];
  const byReq = new Map(requests.map((r) => [r.id, r]));
  const cmIds = rows.map((i) => i.commentId).filter((x): x is string => !!x);
  const comments = cmIds.length
    ? await db
        .select({
          id: schema.comments.id,
          html: schema.comments.html,
          deletedAt: schema.comments.deletedAt,
          author: {
            id: schema.user.id,
            name: schema.user.name,
            email: schema.user.email,
            color: schema.user.color,
          },
          task: {
            id: schema.tasks.id,
            number: schema.tasks.number,
            prefix: schema.spaces.taskPrefix,
            title: schema.tasks.title,
            day: schema.tasks.day,
            doneAt: schema.tasks.doneAt,
            deletedAt: schema.tasks.deletedAt,
          },
        })
        .from(schema.comments)
        .innerJoin(schema.user, eq(schema.user.id, schema.comments.authorId))
        .innerJoin(schema.tasks, eq(schema.tasks.id, schema.comments.taskId))
        .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
        .where(inArray(schema.comments.id, cmIds))
    : [];
  const byCm = new Map(comments.map((c) => [c.id, c]));
  const invIds = rows.map((i) => i.inviteId).filter((x): x is string => !!x);
  const invites = invIds.length
    ? await db
        .select({
          id: schema.spaceInvites.id,
          sentAt: schema.spaceInvites.sentAt,
          acceptedAt: schema.spaceInvites.acceptedAt,
          cancelledAt: schema.spaceInvites.cancelledAt,
          spaceId: schema.spaces.id,
          spaceName: schema.spaces.name,
          spaceColor: schema.spaces.color,
          from: {
            id: schema.user.id,
            name: schema.user.name,
            email: schema.user.email,
            color: schema.user.color,
          },
        })
        .from(schema.spaceInvites)
        .innerJoin(schema.spaces, eq(schema.spaces.id, schema.spaceInvites.spaceId))
        .leftJoin(schema.user, eq(schema.user.id, schema.spaceInvites.invitedBy))
        .where(inArray(schema.spaceInvites.id, invIds))
    : [];
  const byInv = new Map(invites.map((v) => [v.id, v]));
  const all: InboxItem[] = [];
  for (const i of rows) {
    const space = i.spaceId ? (spaces.get(i.spaceId) ?? null) : null;
    const base = {
      id: i.id,
      kind: i.kind,
      spaceId: i.spaceId,
      space,
      spaceName: space?.name ?? i.spaceName ?? '',
      createdAt: i.createdAt.toISOString(),
      readAt: i.readAt?.toISOString() ?? null,
    };
    if (i.kind === 'comment') {
      const c = i.commentId ? byCm.get(i.commentId) : undefined;
      if (!c || c.deletedAt || c.task.deletedAt) continue;
      all.push({
        ...base,
        comment: {
          id: c.id,
          html: c.html,
          author: person(c.author),
          task: {
            id: c.task.id,
            ref: `${c.task.prefix}-${c.task.number}`,
            title: c.task.title,
            day: c.task.day,
            done: c.task.doneAt !== null,
          },
        },
      });
    } else if (i.kind === 'invite') {
      const v = i.inviteId ? byInv.get(i.inviteId) : undefined;
      if (!v) continue;
      // Joined some other way (the email's link): the invite has done its job.
      if (v.acceptedAt && spaces.has(v.spaceId)) continue;
      all.push({
        ...base,
        spaceName: v.spaceName,
        invite: {
          id: v.id,
          from: v.from ? person(v.from) : null,
          space: {
            id: v.spaceId,
            name: v.spaceName,
            color: v.spaceColor,
            initials: spaceInitials(v.spaceName),
          },
          state: stateOf(v),
        },
      });
    } else if (i.kind === 'notice') {
      if (!i.notice) continue;
      all.push({ ...base, notice: i.notice });
    } else {
      const r = i.requestId ? byReq.get(i.requestId) : undefined;
      if (!r) continue;
      all.push({ ...base, request: r });
    }
  }
  return all;
}

const toAnswerOf = (i: InboxItem) =>
  (i.kind === 'request' && i.request!.state === 'waiting') ||
  (i.kind === 'invite' && i.invite!.state === 'open');
const answeredOf = (i: InboxItem) =>
  i.kind === 'request' && i.request!.state !== 'waiting' && i.request!.state !== 'withdrawn';
const updateOf = (i: InboxItem) => !toAnswerOf(i) && !answeredOf(i) && i.kind !== 'request';

/** Counts over a list of items: what waits for an answer, and updates not read. */
function countsOf(items: InboxItem[]): InboxCounts {
  return {
    toAnswer: items.filter(toAnswerOf).length,
    unread: items.filter((i) => updateOf(i) && !i.readAt).length,
  };
}

/**
 * One person's Inbox across every space they are in, in its three views, narrowed to one space by `spaceId` and by
 * the words in `q`. Invites and notices only show unfiltered (they are about spaces you are not in).
 */
export async function inboxOf(
  db: Executor,
  user: { id: string; email: string },
  view: InboxView,
  q = '',
  spaceId: string | null = null,
): Promise<InboxResponse> {
  await ensureInvites(db, user);
  const spaces = await spacesOf(db, user.id);
  const everything = await itemsOf(db, await rowsOf(db, user.id, spaces), spaces);
  const bySpace: Record<string, InboxCounts> = {};
  for (const id of spaces.keys())
    bySpace[id] = countsOf(everything.filter((i) => i.space?.id === id && i.kind !== 'notice'));
  const all = spaceId ? everything.filter((i) => i.space?.id === spaceId && i.kind !== 'notice') : everything;
  const sent =
    view === 'sent'
      ? await requestsWhere(
          db,
          and(
            eq(schema.requests.fromId, user.id),
            spaceId
              ? eq(schema.requests.spaceId, spaceId)
              : inArray(schema.requests.spaceId, [...spaces.keys(), '']),
            ne(schema.requests.state, 'withdrawn'),
          ),
        )
      : [];
  return {
    view,
    toAnswer: view === 'inbox' ? filterInbox(all.filter(toAnswerOf), q) : [],
    updates: view === 'inbox' ? filterInbox(all.filter(updateOf), q) : [],
    answered: view === 'answered' ? filterInbox(all.filter(answeredOf), q) : [],
    sent: view === 'sent' ? filterSent(sent, q) : [],
    counts: countsOf(everything),
    bySpace,
  };
}

/** The Inbox counts for /api/me: each space's, and the total (which also holds invites and notices). */
export async function inboxCounts(
  db: Executor,
  user: { id: string; email: string },
): Promise<{ bySpace: Map<string, InboxCounts>; total: InboxCounts }> {
  await ensureInvites(db, user);
  const spaces = await spacesOf(db, user.id);
  const items = await itemsOf(db, await rowsOf(db, user.id, spaces), spaces);
  const bySpace = new Map<string, InboxCounts>();
  for (const id of spaces.keys())
    bySpace.set(id, countsOf(items.filter((i) => i.space?.id === id && i.kind !== 'notice')));
  return { bySpace, total: countsOf(items) };
}
