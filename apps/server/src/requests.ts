import { randomUUID } from 'node:crypto';
import {
  cleanHtml,
  filterInbox,
  filterSent,
  initialsOf,
  POSITION_STEP,
  textOf,
  type InboxCounts,
  type InboxItem,
  type InboxPerson,
  type InboxResponse,
  type InboxView,
  type IsoDate,
  type SyncMutation,
  type TaskRequest,
} from '@tudu/core';
import { and, asc, count, desc, eq, inArray, isNull, ne, schema, sql, type Db } from '@tudu/db';
import type { TaskClocks } from '@tudu/db/schema';
import { Rejected, roleIn, type Applied } from './tasks';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

type RequestMutation = Extract<SyncMutation, { type: `request.${string}` | `inbox.${string}` }>;

const NO_REQUEST = 'That request isn’t there any more.';
const NOT_YOURS_TO_ANSWER = 'That request isn’t yours to answer.';
const ALREADY = 'That request was already answered.';

function person(u: { id: string; name: string; email: string; color: string | null }): InboxPerson {
  return { id: u.id, name: u.name, email: u.email, color: u.color, initials: initialsOf(u.name, u.email) };
}

async function userById(tx: Executor, id: string) {
  const [u] = await tx
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      color: schema.user.color,
    })
    .from(schema.user)
    .where(eq(schema.user.id, id));
  return u ?? null;
}

/** Plain words from the note line become paragraphs of notes. */
function noteHtml(note: string): string {
  const t = note.trim();
  if (!t) return '';
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return t
    .split(/\n{2,}/)
    .map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function attachmentChip(f: { id: string; name: string; size: number }): string {
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const k = Math.max(1, Math.round(f.size / 1024));
  const size = k > 1024 ? `${(k / 1024).toFixed(1)} MB` : `${k} KB`;
  return `<a class="tp-att" href="/api/files/${f.id}" data-id="${f.id}" data-name="${esc(f.name)}" data-size="${f.size}"><span class="tp-att-i"></span>${esc(f.name)}<span class="tp-att-s">${size}</span></a>`;
}

async function endOf(tx: Executor, spaceId: string, ownerId: string, day: IsoDate | null): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${schema.tasks.position})` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        eq(schema.tasks.ownerId, ownerId),
        day === null ? isNull(schema.tasks.day) : eq(schema.tasks.day, day),
        isNull(schema.tasks.deletedAt),
      ),
    );
  return (row?.max ?? 0) + POSITION_STEP;
}

/**
 * Make the task a request becomes: owned by `ownerId`, on `day`, with the note as its notes and the files as its
 * attachments, and the history line that says where it came from.
 */
async function taskFromRequest(
  tx: Tx,
  r: typeof schema.requests.$inferSelect,
  taskId: string,
  ownerId: string,
  day: IsoDate | null,
  at: Date,
  history: { kind: 'accepted'; from: string } | { kind: 'withdrawn'; to: string },
): Promise<void> {
  const [existing] = await tx
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId));
  if (existing) return;
  const [seq] = await tx
    .update(schema.spaces)
    .set({ taskSeq: sql`${schema.spaces.taskSeq} + 1` })
    .where(eq(schema.spaces.id, r.spaceId))
    .returning({ n: schema.spaces.taskSeq });
  const files = r.attachments.length
    ? await tx
        .select({ id: schema.attachments.id, name: schema.attachments.name, size: schema.attachments.size })
        .from(schema.attachments)
        .where(and(inArray(schema.attachments.id, r.attachments), eq(schema.attachments.spaceId, r.spaceId)))
    : [];
  const notes = noteHtml(r.note) + (files.length ? `<p>${files.map(attachmentChip).join(' ')}</p>` : '');
  const iso = at.toISOString();
  const clocks: TaskClocks = { title: iso, done: iso, place: iso, carried: iso, deleted: iso, notes: iso };
  if (r.dueDay) clocks.due = iso;
  if (r.projectId) clocks.project = iso;
  await tx.insert(schema.tasks).values({
    id: taskId,
    spaceId: r.spaceId,
    number: seq!.n,
    title: r.title,
    day,
    position: await endOf(tx, r.spaceId, ownerId, day),
    dueDay: r.dueDay,
    notes: notes ? cleanHtml(notes) : '',
    notesText: notes ? textOf(cleanHtml(notes)) : '',
    projectId: r.projectId,
    createdBy: r.fromId,
    ownerId,
    clocks,
    createdAt: at,
  });
  await tx.insert(schema.taskEvents).values({ taskId, kind: 'created', data: {}, actorId: r.fromId, at });
  if (r.dueDay)
    await tx
      .insert(schema.taskEvents)
      .values({ taskId, kind: 'due.set', data: { due: r.dueDay }, actorId: r.fromId, at });
  await tx.insert(schema.taskEvents).values({
    taskId,
    kind: history.kind,
    data: history.kind === 'accepted' ? { from: history.from } : { to: history.to },
    actorId: ownerId,
    at,
  });
  if (files.length)
    await tx
      .update(schema.attachments)
      .set({ taskId })
      .where(
        inArray(
          schema.attachments.id,
          files.map((f) => f.id),
        ),
      );
}

async function lockRequest(tx: Tx, id: string) {
  const [r] = await tx.select().from(schema.requests).where(eq(schema.requests.id, id)).for('update');
  if (!r) throw new Rejected(404, NO_REQUEST);
  return r;
}

/** Apply a request or Inbox mutation. Returns what changed and whose Inboxes to tell. */
export async function applyRequest(tx: Tx, userId: string, m: RequestMutation): Promise<Applied> {
  const at = new Date(m.at);
  switch (m.type) {
    case 'request.send': {
      const p = m.payload;
      if (!(await roleIn(tx, userId, p.spaceId)))
        throw new Rejected(403, 'You can’t send tasks in that space.');
      if (p.toId === userId) throw new Rejected(400, 'You can’t send a task to yourself.');
      if (!(await roleIn(tx, p.toId, p.spaceId))) throw new Rejected(400, 'That person isn’t in this space.');
      const [existing] = await tx
        .select({ id: schema.requests.id })
        .from(schema.requests)
        .where(eq(schema.requests.id, p.id));
      if (existing) return { taskId: p.id, spaceId: p.spaceId, days: [], requests: true };
      if (p.projectId) {
        const [proj] = await tx
          .select({ id: schema.projects.id })
          .from(schema.projects)
          .where(
            and(
              eq(schema.projects.id, p.projectId),
              eq(schema.projects.spaceId, p.spaceId),
              isNull(schema.projects.deletedAt),
            ),
          );
        if (!proj) throw new Rejected(400, 'That project isn’t in this space.');
      }
      await tx.insert(schema.requests).values({
        id: p.id,
        spaceId: p.spaceId,
        fromId: userId,
        toId: p.toId,
        title: p.title,
        note: p.note?.trim() ?? '',
        askedDay: p.askedDay,
        dueDay: p.due ?? null,
        projectId: p.projectId ?? null,
        attachments: p.attachments ?? [],
        createdAt: at,
      });
      await tx.insert(schema.inboxItems).values({
        id: randomUUID(),
        userId: p.toId,
        spaceId: p.spaceId,
        kind: 'request',
        requestId: p.id,
        createdAt: at,
      });
      return { taskId: p.id, spaceId: p.spaceId, days: [], requests: true, inbox: [p.toId, userId] };
    }
    case 'request.accept': {
      const r = await lockRequest(tx, m.payload.id);
      if (r.toId !== userId) throw new Rejected(403, NOT_YOURS_TO_ANSWER);
      if (r.state !== 'waiting') {
        if (r.state === 'accepted' && r.taskId === m.payload.taskId)
          return { taskId: r.taskId, spaceId: r.spaceId, days: [], requests: true };
        throw new Rejected(409, ALREADY);
      }
      const from = await userById(tx, r.fromId);
      await taskFromRequest(tx, r, m.payload.taskId, userId, m.payload.day, at, {
        kind: 'accepted',
        from: from?.name || from?.email || 'Someone',
      });
      await tx
        .update(schema.requests)
        .set({ state: 'accepted', taskId: m.payload.taskId, answeredAt: at, seenAt: r.seenAt ?? at })
        .where(eq(schema.requests.id, r.id));
      await tx
        .update(schema.inboxItems)
        .set({ answeredAt: at, readAt: sql`coalesce(${schema.inboxItems.readAt}, ${at})` })
        .where(and(eq(schema.inboxItems.requestId, r.id), eq(schema.inboxItems.userId, userId)));
      await tx.insert(schema.inboxItems).values({
        id: randomUUID(),
        userId: r.fromId,
        spaceId: r.spaceId,
        kind: 'answer',
        requestId: r.id,
        createdAt: at,
      });
      return {
        taskId: m.payload.taskId,
        spaceId: r.spaceId,
        days: [m.payload.day],
        requests: true,
        inbox: [r.fromId, userId],
      };
    }
    case 'request.decline': {
      const r = await lockRequest(tx, m.payload.id);
      if (r.toId !== userId) throw new Rejected(403, NOT_YOURS_TO_ANSWER);
      if (r.state !== 'waiting') {
        if (r.state === 'declined') return { taskId: r.id, spaceId: r.spaceId, days: [], requests: true };
        throw new Rejected(409, ALREADY);
      }
      await tx
        .update(schema.requests)
        .set({ state: 'declined', reason: m.payload.reason, answeredAt: at, seenAt: r.seenAt ?? at })
        .where(eq(schema.requests.id, r.id));
      await tx
        .update(schema.inboxItems)
        .set({ answeredAt: at, readAt: sql`coalesce(${schema.inboxItems.readAt}, ${at})` })
        .where(and(eq(schema.inboxItems.requestId, r.id), eq(schema.inboxItems.userId, userId)));
      await tx.insert(schema.inboxItems).values({
        id: randomUUID(),
        userId: r.fromId,
        spaceId: r.spaceId,
        kind: 'answer',
        requestId: r.id,
        createdAt: at,
      });
      return { taskId: r.id, spaceId: r.spaceId, days: [], requests: true, inbox: [r.fromId, userId] };
    }
    case 'request.withdraw': {
      const r = await lockRequest(tx, m.payload.id);
      if (r.fromId !== userId) throw new Rejected(403, 'Only the person who sent it can take it back.');
      if (r.state === 'withdrawn')
        return { taskId: r.taskId ?? r.id, spaceId: r.spaceId, days: [], requests: true };
      if (r.state === 'accepted') throw new Rejected(409, 'They already took it on; it’s their task now.');
      const to = await userById(tx, r.toId);
      await taskFromRequest(tx, r, m.payload.taskId, userId, m.payload.day, at, {
        kind: 'withdrawn',
        to: to?.name || to?.email || 'someone',
      });
      await tx
        .update(schema.requests)
        .set({ state: 'withdrawn', taskId: m.payload.taskId, answeredAt: at })
        .where(eq(schema.requests.id, r.id));
      // The receiver's item goes, and so does the sender's own update about it.
      await tx.delete(schema.inboxItems).where(eq(schema.inboxItems.requestId, r.id));
      return {
        taskId: m.payload.taskId,
        spaceId: r.spaceId,
        days: [m.payload.day],
        requests: true,
        inbox: [r.toId, userId],
      };
    }
    case 'inbox.read': {
      const [item] = await tx
        .select()
        .from(schema.inboxItems)
        .where(eq(schema.inboxItems.id, m.payload.id))
        .for('update');
      if (!item) throw new Rejected(404, 'That item isn’t in your Inbox any more.');
      if (item.userId !== userId) throw new Rejected(403, 'That isn’t your Inbox.');
      const tell = [userId];
      if (!item.readAt)
        await tx.update(schema.inboxItems).set({ readAt: at }).where(eq(schema.inboxItems.id, item.id));
      // Opening a request tells the sender it was seen.
      if (item.kind === 'request' && item.requestId) {
        const [r] = await tx
          .select({ seenAt: schema.requests.seenAt, fromId: schema.requests.fromId })
          .from(schema.requests)
          .where(eq(schema.requests.id, item.requestId));
        if (r && !r.seenAt) {
          await tx.update(schema.requests).set({ seenAt: at }).where(eq(schema.requests.id, item.requestId));
          tell.push(r.fromId);
        }
      }
      return { taskId: item.id, spaceId: item.spaceId, days: [], requests: true, inbox: tell };
    }
    case 'inbox.readAll': {
      const { spaceId } = m.payload;
      if (!(await roleIn(tx, userId, spaceId))) throw new Rejected(403, 'You’re not in that space.');
      await tx
        .update(schema.inboxItems)
        .set({ readAt: at })
        .where(
          and(
            eq(schema.inboxItems.userId, userId),
            eq(schema.inboxItems.spaceId, spaceId),
            isNull(schema.inboxItems.readAt),
          ),
        );
      return { taskId: m.payload.id, spaceId, days: [], requests: true, inbox: [userId] };
    }
  }
}

const fromUser = schema.user;

/** The requests to or from a person in a space, with both people and the day of the task they became. */
async function requestsWhere(db: Executor, where: ReturnType<typeof and>): Promise<TaskRequest[]> {
  const toUser = sql`to_user`;
  const rows = await db
    .select({
      r: schema.requests,
      fromName: fromUser.name,
      fromEmail: fromUser.email,
      fromColor: fromUser.color,
      toName: sql<string>`${toUser}.name`,
      toEmail: sql<string>`${toUser}.email`,
      toColor: sql<string | null>`${toUser}.color`,
      taskDay: schema.tasks.day,
    })
    .from(schema.requests)
    .innerJoin(fromUser, eq(fromUser.id, schema.requests.fromId))
    .innerJoin(sql`${schema.user} as to_user`, sql`${toUser}.id = ${schema.requests.toId}`)
    .leftJoin(schema.tasks, eq(schema.tasks.id, schema.requests.taskId))
    .where(where)
    .orderBy(desc(schema.requests.createdAt));
  return rows.map(({ r, fromName, fromEmail, fromColor, toName, toEmail, toColor, taskDay }) => ({
    id: r.id,
    spaceId: r.spaceId,
    from: person({ id: r.fromId, name: fromName, email: fromEmail, color: fromColor }),
    to: person({ id: r.toId, name: toName, email: toEmail, color: toColor }),
    title: r.title,
    note: r.note,
    askedDay: r.askedDay,
    due: r.dueDay,
    projectId: r.projectId,
    attachments: r.attachments,
    state: r.state,
    reason: r.reason,
    seenAt: r.seenAt?.toISOString() ?? null,
    taskId: r.taskId,
    taskDay: taskDay ?? null,
    createdAt: r.createdAt.toISOString(),
    answeredAt: r.answeredAt?.toISOString() ?? null,
  }));
}

/** Everything in a person's Inbox for a space, in its three views, narrowed by `q`. */
export async function inboxOf(
  db: Executor,
  userId: string,
  spaceId: string,
  view: InboxView,
  q = '',
): Promise<InboxResponse> {
  const items = await db
    .select()
    .from(schema.inboxItems)
    .where(and(eq(schema.inboxItems.userId, userId), eq(schema.inboxItems.spaceId, spaceId)))
    .orderBy(desc(schema.inboxItems.createdAt));
  const reqIds = [...new Set(items.map((i) => i.requestId).filter((x): x is string => !!x))];
  const requests = reqIds.length ? await requestsWhere(db, and(inArray(schema.requests.id, reqIds))) : [];
  const byReq = new Map(requests.map((r) => [r.id, r]));
  const cmIds = items.map((i) => i.commentId).filter((x): x is string => !!x);
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
  const all: InboxItem[] = [];
  for (const i of items) {
    const base = {
      id: i.id,
      kind: i.kind,
      spaceId: i.spaceId,
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
    } else {
      const r = i.requestId ? byReq.get(i.requestId) : undefined;
      if (!r) continue;
      all.push({ ...base, request: r });
    }
  }
  const toAnswer = all.filter((i) => i.kind === 'request' && i.request!.state === 'waiting');
  const answered = all.filter(
    (i) => i.kind === 'request' && i.request!.state !== 'waiting' && i.request!.state !== 'withdrawn',
  );
  const updates = all.filter((i) => i.kind !== 'request');
  const sent =
    view === 'sent'
      ? await requestsWhere(
          db,
          and(
            eq(schema.requests.fromId, userId),
            eq(schema.requests.spaceId, spaceId),
            ne(schema.requests.state, 'withdrawn'),
          ),
        )
      : [];
  return {
    view,
    toAnswer: view === 'inbox' ? filterInbox(toAnswer, q) : [],
    updates: view === 'inbox' ? filterInbox(updates, q) : [],
    answered: view === 'answered' ? filterInbox(answered, q) : [],
    sent: view === 'sent' ? filterSent(sent, q) : [],
    counts: { toAnswer: toAnswer.length, unread: updates.filter((i) => !i.readAt).length },
  };
}

/** The Inbox counts per space for /api/me: requests waiting, and updates not read. */
export async function inboxCounts(db: Executor, userId: string): Promise<Map<string, InboxCounts>> {
  const rows = await db
    .select({
      spaceId: schema.inboxItems.spaceId,
      kind: schema.inboxItems.kind,
      state: schema.requests.state,
      readAt: schema.inboxItems.readAt,
      n: count(),
    })
    .from(schema.inboxItems)
    .leftJoin(schema.requests, eq(schema.requests.id, schema.inboxItems.requestId))
    .where(eq(schema.inboxItems.userId, userId))
    .groupBy(
      schema.inboxItems.spaceId,
      schema.inboxItems.kind,
      schema.requests.state,
      schema.inboxItems.readAt,
    );
  const out = new Map<string, InboxCounts>();
  for (const r of rows) {
    const c = out.get(r.spaceId) ?? { toAnswer: 0, unread: 0 };
    if (r.kind === 'request') {
      if (r.state === 'waiting') c.toAnswer += r.n;
    } else if (!r.readAt) c.unread += r.n;
    out.set(r.spaceId, c);
  }
  return out;
}

/** A comment on someone's task lands in their Inbox (never your own). */
export async function noteComment(
  tx: Executor,
  task: { id: string; spaceId: string; ownerId: string | null },
  commentId: string,
  authorId: string,
  at: Date,
): Promise<string[]> {
  if (!task.ownerId || task.ownerId === authorId) return [];
  await tx.insert(schema.inboxItems).values({
    id: randomUUID(),
    userId: task.ownerId,
    spaceId: task.spaceId,
    kind: 'comment',
    taskId: task.id,
    commentId,
    createdAt: at,
  });
  return [task.ownerId];
}

export const _test = { asc };
