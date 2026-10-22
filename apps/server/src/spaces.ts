import { randomBytes, randomUUID } from 'node:crypto';
import {
  INVITE_DAYS,
  initialsOf,
  PERSONAL_SLUG,
  personColor,
  spaceInitials,
  spacePrefix,
  spaceSlug,
  type Invite,
  type InviteOutcome,
  type JoinResponse,
  type Member,
  type PeopleResponse,
  type PersonResponse,
  type PersonTasks,
  type SpaceSummary,
  type IsoDate,
} from '@tudu/core';
import { and, asc, count, eq, gte, inArray, isNull, lte, schema, type Db } from '@tudu/db';
import type { Mailer } from './email';
import { inviteMail } from './email';
import { forgetFormer, oldSlugsOf } from './settings';
import { roleIn, toTask } from './tasks';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

/** Something the person may not do, with the status the API answers. */
export class SpaceError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const userColumns = {
  id: schema.user.id,
  name: schema.user.name,
  email: schema.user.email,
  color: schema.user.color,
  image: schema.user.image,
};

/** The address part of a space: Personal is `me`, a team space its slug. */
export function slugOf(s: { kind: 'personal' | 'team'; slug: string | null; id: string }): string {
  return s.kind === 'personal' ? PERSONAL_SLUG : (s.slug ?? s.id);
}

/** The spaces a person is in, as /api/me lists them: role, address, prefix and how many people. */
export async function spaceSummaries(db: Executor, userId: string): Promise<SpaceSummary[]> {
  const rows = await db
    .select({
      id: schema.spaces.id,
      kind: schema.spaces.kind,
      name: schema.spaces.name,
      color: schema.spaces.color,
      slug: schema.spaces.slug,
      prefix: schema.spaces.taskPrefix,
      role: schema.spaceMembers.role,
    })
    .from(schema.spaceMembers)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.spaceMembers.spaceId))
    .where(eq(schema.spaceMembers.userId, userId))
    .orderBy(schema.spaces.kind, schema.spaces.createdAt);
  if (!rows.length) return [];
  const counts = await db
    .select({ spaceId: schema.spaceMembers.spaceId, n: count() })
    .from(schema.spaceMembers)
    .where(
      inArray(
        schema.spaceMembers.spaceId,
        rows.map((r) => r.id),
      ),
    )
    .groupBy(schema.spaceMembers.spaceId);
  const n = new Map(counts.map((c) => [c.spaceId, c.n]));
  const old = await oldSlugsOf(
    db,
    rows.map((r) => r.id),
  );
  // The spaces you came into by an invite, and who sent the latest one you took.
  const invites = await db
    .select({ spaceId: schema.spaceInvites.spaceId, by: schema.user.name })
    .from(schema.spaceInvites)
    .leftJoin(schema.user, eq(schema.user.id, schema.spaceInvites.invitedBy))
    .where(
      and(
        eq(schema.spaceInvites.acceptedBy, userId),
        inArray(
          schema.spaceInvites.spaceId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .orderBy(asc(schema.spaceInvites.acceptedAt));
  const joined = new Map(invites.map((i) => [i.spaceId, { by: i.by || null }]));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    color: r.color,
    role: r.role,
    slug: slugOf(r),
    prefix: r.prefix,
    members: n.get(r.id) ?? 1,
    inbox: { toAnswer: 0, unread: 0 },
    oldSlugs: old.get(r.id) ?? [],
    ...(r.kind === 'team' && joined.has(r.id) ? { joined: joined.get(r.id)! } : {}),
  }));
}

/** One space as /api/me lists it, for the person asking. */
export async function spaceSummary(
  db: Executor,
  userId: string,
  spaceId: string,
): Promise<SpaceSummary | null> {
  return (await spaceSummaries(db, userId)).find((s) => s.id === spaceId) ?? null;
}

/** A Postgres unique-index violation, wherever the driver put the code. */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.code;
  const inner = (err as { cause?: { code?: string } } | null)?.cause?.code;
  return code === '23505' || inner === '23505';
}

/**
 * Make a team space: the maker is its admin; the prefix and the slug come from the name. Two people making a space
 * with the same name at the same moment would pick the same slug: the loser tries again with the slug now taken.
 */
export async function createSpace(
  db: Db,
  userId: string,
  input: { name: string; color: string },
): Promise<SpaceSummary> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await createSpaceOnce(db, userId, input);
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= 4) throw err;
    }
  }
}

async function createSpaceOnce(
  db: Db,
  userId: string,
  input: { name: string; color: string },
): Promise<SpaceSummary> {
  return db.transaction(async (tx) => {
    const mine = await tx
      .select({ prefix: schema.spaces.taskPrefix })
      .from(schema.spaceMembers)
      .innerJoin(schema.spaces, eq(schema.spaces.id, schema.spaceMembers.spaceId))
      .where(eq(schema.spaceMembers.userId, userId));
    // An address a renamed space used to have still leads there, so it is taken too.
    const slugs = [
      ...(await tx.select({ slug: schema.spaces.slug }).from(schema.spaces)),
      ...(await tx.select({ slug: schema.spaceSlugs.slug }).from(schema.spaceSlugs)),
    ];
    const id = randomUUID();
    const name = input.name.trim();
    await tx.insert(schema.spaces).values({
      id,
      kind: 'team',
      name,
      color: input.color,
      slug: spaceSlug(
        name,
        slugs.map((s) => s.slug).filter((s): s is string => !!s),
      ),
      taskPrefix: spacePrefix(
        name,
        mine.map((m) => m.prefix),
      ),
    });
    await tx.insert(schema.spaceMembers).values({ spaceId: id, userId, role: 'admin' });
    return (await spaceSummary(tx, userId, id))!;
  });
}

function toMember(r: {
  id: string;
  name: string;
  email: string;
  color: string | null;
  image: string | null;
  role: 'admin' | 'member';
  joinedAt: Date;
}): Member {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    color: r.color,
    image: r.image,
    role: r.role,
    joinedAt: r.joinedAt.toISOString(),
  };
}

/** Everyone in a space, oldest member first. */
export async function membersDetail(db: Executor, spaceId: string): Promise<Member[]> {
  const rows = await db
    .select({ ...userColumns, role: schema.spaceMembers.role, joinedAt: schema.spaceMembers.joinedAt })
    .from(schema.spaceMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.spaceMembers.userId))
    .where(eq(schema.spaceMembers.spaceId, spaceId))
    .orderBy(asc(schema.spaceMembers.joinedAt), asc(schema.user.name));
  return rows.map(toMember);
}

const inviteColumns = {
  id: schema.spaceInvites.id,
  email: schema.spaceInvites.email,
  role: schema.spaceInvites.role,
  sentAt: schema.spaceInvites.sentAt,
  inviterId: schema.user.id,
  inviterName: schema.user.name,
};

function toInvite(r: {
  id: string;
  email: string;
  role: 'admin' | 'member';
  sentAt: Date;
  inviterId: string | null;
  inviterName: string | null;
}): Invite {
  return {
    id: r.id,
    email: r.email,
    role: r.role,
    sentAt: r.sentAt.toISOString(),
    invitedBy: r.inviterId ? { id: r.inviterId, name: r.inviterName ?? '' } : null,
  };
}

/** The invites to a space still waiting, newest first. */
export async function pendingInvites(db: Executor, spaceId: string): Promise<Invite[]> {
  const rows = await db
    .select(inviteColumns)
    .from(schema.spaceInvites)
    .leftJoin(schema.user, eq(schema.user.id, schema.spaceInvites.invitedBy))
    .where(
      and(
        eq(schema.spaceInvites.spaceId, spaceId),
        isNull(schema.spaceInvites.acceptedAt),
        isNull(schema.spaceInvites.cancelledAt),
      ),
    )
    .orderBy(asc(schema.spaceInvites.sentAt));
  return rows.map(toInvite).reverse();
}

function newToken(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * Invite people by email. An address already in the space is told so; one already invited gets the mail again (a
 * fresh link); the rest get an invite each. Returns what each address came to, and the invites now pending.
 */
export async function invite(
  db: Db,
  mailer: Mailer,
  webUrl: string,
  userId: string,
  spaceId: string,
  emails: string[],
): Promise<{ results: Array<{ email: string; outcome: InviteOutcome }>; invites: Invite[]; sent: string[] }> {
  const [space] = await db
    .select({ name: schema.spaces.name, kind: schema.spaces.kind })
    .from(schema.spaces)
    .where(eq(schema.spaces.id, spaceId));
  if (!space || space.kind !== 'team') throw new SpaceError(400, 'Personal is just you: no one to invite.');
  const [from] = await db.select(userColumns).from(schema.user).where(eq(schema.user.id, userId));
  const members = await membersDetail(db, spaceId);
  const have = new Set(members.map((m) => m.email.toLowerCase()));
  const results: Array<{ email: string; outcome: InviteOutcome }> = [];
  const sent: string[] = [];
  const seen = new Set<string>();
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (have.has(email)) {
      results.push({ email, outcome: 'member' });
      continue;
    }
    const token = newToken();
    const [pending] = await db
      .select({ id: schema.spaceInvites.id })
      .from(schema.spaceInvites)
      .where(
        and(
          eq(schema.spaceInvites.spaceId, spaceId),
          eq(schema.spaceInvites.email, email),
          isNull(schema.spaceInvites.acceptedAt),
          isNull(schema.spaceInvites.cancelledAt),
        ),
      );
    if (pending) {
      await db
        .update(schema.spaceInvites)
        .set({ token, sentAt: new Date(), invitedBy: userId })
        .where(eq(schema.spaceInvites.id, pending.id));
      results.push({ email, outcome: 'resent' });
    } else {
      await db
        .insert(schema.spaceInvites)
        .values({ id: randomUUID(), spaceId, email, token, invitedBy: userId });
      results.push({ email, outcome: 'sent' });
    }
    sent.push(email);
    await mailer.send(
      inviteMail({
        to: email,
        spaceName: space.name,
        fromName: from?.name || from?.email || 'Someone',
        link: `${webUrl.replace(/\/$/, '')}/join/${token}`,
      }),
    );
  }
  return { results, invites: await pendingInvites(db, spaceId), sent };
}

/** The invite's space and whether the asking person may touch it (any member may). */
async function inviteOf(db: Executor, userId: string, inviteId: string) {
  const [row] = await db
    .select({
      id: schema.spaceInvites.id,
      spaceId: schema.spaceInvites.spaceId,
      acceptedAt: schema.spaceInvites.acceptedAt,
      cancelledAt: schema.spaceInvites.cancelledAt,
    })
    .from(schema.spaceInvites)
    .where(eq(schema.spaceInvites.id, inviteId));
  if (!row) throw new SpaceError(404, 'That invite isn’t there any more.');
  if (!(await roleIn(db, userId, row.spaceId))) throw new SpaceError(403, 'You’re not in that space.');
  return row;
}

/** Take an invite back; its link stops working. */
export async function cancelInvite(db: Db, userId: string, inviteId: string): Promise<string> {
  const row = await inviteOf(db, userId, inviteId);
  if (row.acceptedAt) throw new SpaceError(409, 'That invite was already taken up.');
  if (!row.cancelledAt)
    await db
      .update(schema.spaceInvites)
      .set({ cancelledAt: new Date() })
      .where(eq(schema.spaceInvites.id, inviteId));
  return row.spaceId;
}

/** Undo a cancel: the same invite, and its link, work again. */
export async function restoreInvite(db: Db, userId: string, inviteId: string): Promise<string> {
  const row = await inviteOf(db, userId, inviteId);
  if (row.acceptedAt) throw new SpaceError(409, 'That invite was already taken up.');
  await db.update(schema.spaceInvites).set({ cancelledAt: null }).where(eq(schema.spaceInvites.id, inviteId));
  return row.spaceId;
}

async function inviteByToken(db: Executor, token: string) {
  const [row] = await db
    .select({
      id: schema.spaceInvites.id,
      spaceId: schema.spaceInvites.spaceId,
      email: schema.spaceInvites.email,
      role: schema.spaceInvites.role,
      sentAt: schema.spaceInvites.sentAt,
      acceptedAt: schema.spaceInvites.acceptedAt,
      cancelledAt: schema.spaceInvites.cancelledAt,
      inviterName: schema.user.name,
      inviterEmail: schema.user.email,
      spaceName: schema.spaces.name,
      spaceColor: schema.spaces.color,
      spaceSlug: schema.spaces.slug,
      spaceKind: schema.spaces.kind,
    })
    .from(schema.spaceInvites)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.spaceInvites.spaceId))
    .leftJoin(schema.user, eq(schema.user.id, schema.spaceInvites.invitedBy))
    .where(eq(schema.spaceInvites.token, token));
  return row ?? null;
}

function stateOf(row: {
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  sentAt: Date;
}): JoinResponse['state'] {
  if (row.cancelledAt) return 'cancelled';
  if (row.acceptedAt) return 'spent';
  if (Date.now() - row.sentAt.getTime() > INVITE_DAYS * 86_400_000) return 'expired';
  return 'open';
}

/** What a join link says: the space, who asked, who is in it, and whether it can still be used. */
export async function joinInfo(
  db: Executor,
  token: string,
  you: { id: string; email: string } | null,
): Promise<JoinResponse> {
  const row = await inviteByToken(db, token);
  if (!row) throw new SpaceError(404, 'That invite link doesn’t lead anywhere.');
  const members = await membersDetail(db, row.spaceId);
  return {
    space: {
      id: row.spaceId,
      name: row.spaceName,
      color: row.spaceColor,
      slug: slugOf({ kind: row.spaceKind, slug: row.spaceSlug, id: row.spaceId }),
      initials: spaceInitials(row.spaceName),
    },
    from: row.inviterName || row.inviterEmail ? { name: row.inviterName || row.inviterEmail! } : null,
    count: members.length,
    people: members.slice(0, 5).map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      initials: initialsOf(m.name, m.email),
    })),
    email: row.email,
    state: stateOf(row),
    you: you
      ? {
          member: members.some((m) => m.id === you.id),
          matches: you.email.toLowerCase() === row.email.toLowerCase(),
        }
      : null,
  };
}

/** Use a join link: the signed-in person becomes a member and the link is spent. */
export async function join(
  db: Db,
  token: string,
  you: { id: string; email: string },
): Promise<{ space: SpaceSummary; joined: boolean }> {
  return db.transaction(async (tx) => {
    const row = await inviteByToken(tx, token);
    if (!row) throw new SpaceError(404, 'That invite link doesn’t lead anywhere.');
    const already = !!(await roleIn(tx, you.id, row.spaceId));
    const state = stateOf(row);
    if (state !== 'open' && !(state === 'spent' && already))
      throw new SpaceError(
        410,
        state === 'expired' ? 'This invite has expired.' : 'This invite was taken back.',
        {
          state,
        },
      );
    if (you.email.toLowerCase() !== row.email.toLowerCase())
      throw new SpaceError(403, 'That invite was sent to another address.', { state, email: row.email });
    if (!already) {
      await tx
        .insert(schema.spaceMembers)
        .values({ spaceId: row.spaceId, userId: you.id, role: row.role })
        .onConflictDoNothing();
      await forgetFormer(tx, row.spaceId, you.id);
    }
    if (!row.acceptedAt)
      await tx
        .update(schema.spaceInvites)
        .set({ acceptedAt: new Date(), acceptedBy: you.id })
        .where(eq(schema.spaceInvites.id, row.id));
    return { space: (await spaceSummary(tx, you.id, row.spaceId))!, joined: !already };
  });
}

/** Give a new person their colour, once. */
export async function colourOf(db: Executor, userId: string): Promise<string> {
  const color = personColor(userId);
  await db
    .update(schema.user)
    .set({ color })
    .where(and(eq(schema.user.id, userId), isNull(schema.user.color)));
  return color;
}

const sharedColumns = {
  id: schema.tasks.id,
  spaceId: schema.tasks.spaceId,
  number: schema.tasks.number,
  prefix: schema.spaces.taskPrefix,
  title: schema.tasks.title,
  day: schema.tasks.day,
  position: schema.tasks.position,
  doneAt: schema.tasks.doneAt,
  carriedFrom: schema.tasks.carriedFrom,
  dueDay: schema.tasks.dueDay,
  visibility: schema.tasks.visibility,
  projectId: schema.tasks.projectId,
  jiraKey: schema.tasks.jiraKey,
  ownerId: schema.tasks.ownerId,
  createdAt: schema.tasks.createdAt,
  updatedAt: schema.tasks.updatedAt,
};

/**
 * People: everyone in the space with the tasks they share (visible to everyone, not Only me) planned between
 * `from` and `to`, and how many that is. The person asking is marked `you`.
 */
export async function peopleOf(
  db: Executor,
  spaceId: string,
  you: string,
  from: IsoDate,
  to: IsoDate,
): Promise<PeopleResponse> {
  const members = await membersDetail(db, spaceId);
  const rows = await db
    .select(sharedColumns)
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        eq(schema.tasks.visibility, 'space'),
        isNull(schema.tasks.deletedAt),
        gte(schema.tasks.day, from),
        lte(schema.tasks.day, to),
      ),
    )
    .orderBy(asc(schema.tasks.day), asc(schema.tasks.position), asc(schema.tasks.createdAt));
  const byOwner = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.ownerId) continue;
    const list = byOwner.get(r.ownerId) ?? [];
    list.push(r);
    byOwner.set(r.ownerId, list);
  }
  // People who left: what they shared stays, under their name marked Left, while there is any in the range.
  const former = await db
    .select(userColumns)
    .from(schema.formerMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.formerMembers.userId))
    .where(eq(schema.formerMembers.spaceId, spaceId))
    .orderBy(asc(schema.user.name));
  const person = (
    m: { id: string; name: string; email: string; color: string | null; image: string | null },
    left = false,
  ): PersonTasks => {
    const tasks = (byOwner.get(m.id) ?? []).map((r) => toTask(r));
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      color: m.color,
      image: m.image,
      initials: initialsOf(m.name, m.email),
      you: m.id === you,
      ...(left ? { left: true } : {}),
      count: tasks.length,
      tasks,
    };
  };
  return {
    from,
    to,
    members: [
      ...members.map((m) => person({ ...m, image: m.image ?? null })),
      ...former.filter((f) => byOwner.has(f.id)).map((f) => person(f, true)),
    ],
  };
}

/** One person in a space with their shared tasks for the range; null for someone not in it. */
export async function personOf(
  db: Executor,
  spaceId: string,
  you: string,
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<PersonResponse | null> {
  const all = await peopleOf(db, spaceId, you, from, to);
  const person = all.members.find((m) => m.id === userId);
  return person ? { from, to, person } : null;
}
