import { randomUUID } from 'node:crypto';
import { canChangeRole, spaceRules, spaceSlug, type SpaceGoneEvent } from '@tudu/core';
import { and, eq, inArray, isNull, ne, schema, type Db } from '@tudu/db';
import { membersDetail, SpaceError } from './spaces';
import { forgetRemoval, noteSpaceGone } from './inbox';
import { roleIn } from './tasks';
import type { Storage } from './storage';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

const NOT_ADMIN = 'Only an admin can do that.';

async function spaceRow(db: Executor, spaceId: string) {
  const [s] = await db
    .select({
      id: schema.spaces.id,
      kind: schema.spaces.kind,
      name: schema.spaces.name,
      slug: schema.spaces.slug,
    })
    .from(schema.spaces)
    .where(eq(schema.spaces.id, spaceId));
  return s ?? null;
}

async function nameOf(db: Executor, userId: string): Promise<string> {
  const [u] = await db
    .select({ name: schema.user.name, email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  return u?.name || u?.email || 'Someone';
}

/** The asker must be an admin of this team space. */
async function mustAdmin(db: Executor, userId: string, spaceId: string) {
  const s = await spaceRow(db, spaceId);
  if (!s) throw new SpaceError(404, 'That space isn’t there any more.');
  const role = await roleIn(db, userId, spaceId);
  if (!role) throw new SpaceError(403, 'You’re not in that space.');
  if (s.kind !== 'team') throw new SpaceError(400, 'Personal is yours alone.');
  if (role !== 'admin') throw new SpaceError(403, NOT_ADMIN);
  return s;
}

/**
 * Rename a team space: its address follows the name, and the old address keeps landing (it is kept in
 * space_slugs). The task prefix never changes, so NW-12 stays NW-12.
 */
export async function moveSlug(tx: Tx, spaceId: string, name: string): Promise<void> {
  const [s] = await tx
    .select({ slug: schema.spaces.slug })
    .from(schema.spaces)
    .where(eq(schema.spaces.id, spaceId))
    .for('update');
  if (!s) return;
  const others = await tx
    .select({ slug: schema.spaces.slug })
    .from(schema.spaces)
    .where(ne(schema.spaces.id, spaceId));
  const kept = await tx
    .select({ slug: schema.spaceSlugs.slug })
    .from(schema.spaceSlugs)
    .where(ne(schema.spaceSlugs.spaceId, spaceId));
  const taken = [...others.map((o) => o.slug), ...kept.map((k) => k.slug)].filter((x): x is string => !!x);
  const next = spaceSlug(name, taken);
  if (next === s.slug) return;
  // A space going back to a name it had takes its old address back.
  await tx.delete(schema.spaceSlugs).where(eq(schema.spaceSlugs.slug, next));
  if (s.slug) await tx.insert(schema.spaceSlugs).values({ slug: s.slug, spaceId }).onConflictDoNothing();
  await tx
    .update(schema.spaces)
    .set({ slug: next, updatedAt: new Date() })
    .where(eq(schema.spaces.id, spaceId));
}

/** The old slugs of these spaces, for /api/me. */
export async function oldSlugsOf(db: Executor, spaceIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!spaceIds.length) return out;
  const rows = await db
    .select({ slug: schema.spaceSlugs.slug, spaceId: schema.spaceSlugs.spaceId })
    .from(schema.spaceSlugs)
    .where(inArray(schema.spaceSlugs.spaceId, spaceIds));
  for (const r of rows) out.set(r.spaceId, [...(out.get(r.spaceId) ?? []), r.slug]);
  return out;
}

/** An admin makes someone an admin or a member. Never your own role; never the last admin down to member. */
export async function setRole(
  db: Db,
  userId: string,
  spaceId: string,
  target: string,
  role: 'admin' | 'member',
): Promise<void> {
  await db.transaction(async (tx) => {
    await mustAdmin(tx, userId, spaceId);
    const members = await membersDetail(tx, spaceId);
    const t = members.find((m) => m.id === target);
    if (!t) throw new SpaceError(404, 'No one by that name in this space.');
    if (t.role === role) return;
    if (target === userId)
      throw new SpaceError(400, 'You can’t change your own role. Leave the space instead.');
    if (!canChangeRole(members, userId, target, role))
      throw new SpaceError(409, 'A space needs at least one admin.');
    await tx
      .update(schema.spaceMembers)
      .set({ role })
      .where(and(eq(schema.spaceMembers.spaceId, spaceId), eq(schema.spaceMembers.userId, target)));
  });
}

/** What a departure changed for others: whose Inboxes now hold an answer. */
export interface Departure {
  /** Senders told that their request was declined. */
  told: string[];
}

/**
 * Someone stops being in a space. Their shared tasks stay, owned by them (People marks them Left); their Only-me
 * tasks there are deleted; requests waiting for them go back to the sender as declined. What changed is kept on
 * the former-member row, so Undo can put it all back.
 */
async function depart(
  tx: Tx,
  spaceId: string,
  target: string,
  how: 'left' | 'removed',
  by: string,
): Promise<Departure> {
  const [m] = await tx
    .select({ role: schema.spaceMembers.role, joinedAt: schema.spaceMembers.joinedAt })
    .from(schema.spaceMembers)
    .where(and(eq(schema.spaceMembers.spaceId, spaceId), eq(schema.spaceMembers.userId, target)))
    .for('update');
  if (!m) throw new SpaceError(404, 'No one by that name in this space.');
  const space = (await spaceRow(tx, spaceId))!;
  const who = await nameOf(tx, target);
  const at = new Date();
  const gone = await tx
    .update(schema.tasks)
    .set({ deletedAt: at, updatedAt: at })
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        eq(schema.tasks.ownerId, target),
        eq(schema.tasks.visibility, 'me'),
        isNull(schema.tasks.deletedAt),
      ),
    )
    .returning({ id: schema.tasks.id });
  const reason = how === 'left' ? `${who} left ${space.name}.` : `${who} was removed from ${space.name}.`;
  const waiting = await tx
    .update(schema.requests)
    .set({ state: 'declined', reason, answeredAt: at })
    .where(
      and(
        eq(schema.requests.spaceId, spaceId),
        eq(schema.requests.toId, target),
        eq(schema.requests.state, 'waiting'),
      ),
    )
    .returning({ id: schema.requests.id, fromId: schema.requests.fromId });
  const answers = waiting.map((r) => ({
    id: randomUUID(),
    userId: r.fromId,
    spaceId,
    kind: 'answer' as const,
    requestId: r.id,
    createdAt: at,
  }));
  if (answers.length) await tx.insert(schema.inboxItems).values(answers);
  await tx
    .delete(schema.spaceMembers)
    .where(and(eq(schema.spaceMembers.spaceId, spaceId), eq(schema.spaceMembers.userId, target)));
  const undo = {
    tasks: gone.map((g) => g.id),
    requests: waiting.map((r) => r.id),
    answers: answers.map((a) => a.id),
  };
  await tx
    .insert(schema.formerMembers)
    .values({ spaceId, userId: target, role: m.role, joinedAt: m.joinedAt, leftAt: at, how, by, undo })
    .onConflictDoUpdate({
      target: [schema.formerMembers.spaceId, schema.formerMembers.userId],
      set: { role: m.role, joinedAt: m.joinedAt, leftAt: at, how, by, undo },
    });
  return { told: [...new Set(waiting.map((r) => r.fromId))] };
}

/** An admin takes someone out of the space. */
export async function removeMember(
  db: Db,
  userId: string,
  spaceId: string,
  target: string,
): Promise<Departure> {
  return db.transaction(async (tx) => {
    await mustAdmin(tx, userId, spaceId);
    if (target === userId) throw new SpaceError(400, 'To go yourself, leave the space.');
    const out = await depart(tx, spaceId, target, 'removed', userId);
    const space = (await spaceRow(tx, spaceId))!;
    await noteSpaceGone(tx, [target], { id: spaceId, name: space.name }, 'removed', await nameOf(tx, userId));
    return out;
  });
}

/** Undo a Remove: the person is back with their role, their Only-me tasks and the requests that waited for them. */
export async function restoreMember(
  db: Db,
  userId: string,
  spaceId: string,
  target: string,
): Promise<string[]> {
  return db.transaction(async (tx) => {
    await mustAdmin(tx, userId, spaceId);
    const [f] = await tx
      .select()
      .from(schema.formerMembers)
      .where(and(eq(schema.formerMembers.spaceId, spaceId), eq(schema.formerMembers.userId, target)))
      .for('update');
    if (!f || f.how !== 'removed') throw new SpaceError(404, 'There’s no one to put back.');
    await tx
      .insert(schema.spaceMembers)
      .values({ spaceId, userId: target, role: f.role, joinedAt: f.joinedAt })
      .onConflictDoNothing();
    if (f.undo.tasks.length)
      await tx
        .update(schema.tasks)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(inArray(schema.tasks.id, f.undo.tasks));
    let told: string[] = [];
    if (f.undo.requests.length) {
      const back = await tx
        .update(schema.requests)
        .set({ state: 'waiting', reason: null, answeredAt: null })
        .where(and(inArray(schema.requests.id, f.undo.requests), eq(schema.requests.state, 'declined')))
        .returning({ fromId: schema.requests.fromId });
      told = [...new Set(back.map((b) => b.fromId))];
    }
    if (f.undo.answers.length)
      await tx.delete(schema.inboxItems).where(inArray(schema.inboxItems.id, f.undo.answers));
    await forgetRemoval(tx, target, spaceId);
    await tx
      .delete(schema.formerMembers)
      .where(and(eq(schema.formerMembers.spaceId, spaceId), eq(schema.formerMembers.userId, target)));
    return told;
  });
}

/** You leave a space. The last admin must make someone else admin first; the last person deletes it instead. */
export async function leaveSpace(db: Db, userId: string, spaceId: string): Promise<Departure> {
  return db.transaction(async (tx) => {
    const s = await spaceRow(tx, spaceId);
    const role = s ? await roleIn(tx, userId, spaceId) : null;
    if (!s || !role) throw new SpaceError(403, 'You’re not in that space.');
    const members = await membersDetail(tx, spaceId);
    const block = spaceRules({ kind: s.kind, role: role as 'admin' | 'member' }, members, userId).leaveBlock;
    if (block === 'personal') throw new SpaceError(400, 'Personal is yours; it can’t be left.');
    if (block === 'last-person')
      throw new SpaceError(409, `You’re the only one in ${s.name}. Delete it instead.`, { block });
    if (block === 'last-admin')
      throw new SpaceError(409, `Make someone else an admin of ${s.name} first.`, { block });
    return depart(tx, spaceId, userId, 'left', userId);
  });
}

/**
 * An admin deletes a team space with everything in it: lists, tasks, comments, files (the stored objects too),
 * invites, requests and Inbox items. Returns who was in it, to tell them.
 */
export async function deleteSpace(
  db: Db,
  storage: Storage,
  userId: string,
  spaceId: string,
): Promise<{ members: string[]; event: SpaceGoneEvent }> {
  const out = await db.transaction(async (tx) => {
    const s = await mustAdmin(tx, userId, spaceId);
    const members = (await membersDetail(tx, spaceId)).map((m) => m.id);
    const keys = await tx
      .select({ key: schema.attachments.key })
      .from(schema.attachments)
      .where(eq(schema.attachments.spaceId, spaceId));
    const by = await nameOf(tx, userId);
    // Everyone else hears it in their Inbox too; the notice keeps the name once the space is gone.
    await noteSpaceGone(
      tx,
      members.filter((m) => m !== userId),
      { id: spaceId, name: s.name },
      'deleted',
      by,
    );
    await tx.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
    const event: SpaceGoneEvent = { spaceId, name: s.name, how: 'deleted', by };
    return { members, keys: keys.map((k) => k.key), event };
  });
  // The rows are gone; the objects follow. One that fails to go is only storage, never data anyone can reach.
  for (const key of out.keys) await storage.delete(key).catch(() => undefined);
  return { members: out.members, event: out.event };
}

/** Joining again after leaving: no longer a former member. */
export async function forgetFormer(db: Executor, spaceId: string, userId: string): Promise<void> {
  await db
    .delete(schema.formerMembers)
    .where(and(eq(schema.formerMembers.spaceId, spaceId), eq(schema.formerMembers.userId, userId)));
}

/** The name to tell people who did it. */
export { nameOf };
