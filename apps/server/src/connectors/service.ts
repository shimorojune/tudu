import { randomUUID } from 'node:crypto';
import {
  jiraCount,
  POSITION_STEP,
  type ConnectorProvider,
  type ConnectorSpace,
  type JiraConnectionResponse,
  type JiraLink,
  type JiraView,
} from '@tudu/core';
import { and, asc, count, eq, isNull, schema, sql, type Db } from '@tudu/db';
import type { Executor } from '../requests';
import { spaceSummaries } from '../spaces';
import { ConnectorFailure } from './failure';
import { connectorOf } from './registry';
import type { ConnectorClient, ConnectorDeps } from './types';

export type Connection = typeof schema.connections.$inferSelect;

/** The count reads at most this many of your assigned issues. */
const COUNT_PAGE = 100;

export async function connectionOf(
  db: Executor,
  userId: string,
  provider: ConnectorProvider,
): Promise<Connection | null> {
  const [row] = await db
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.userId, userId), eq(schema.connections.provider, provider)));
  return row ?? null;
}

/** Whether your switch for an app is on in a space. */
export async function isOn(
  db: Executor,
  userId: string,
  spaceId: string,
  provider: ConnectorProvider,
): Promise<boolean> {
  const [row] = await db
    .select({ on: sql<number>`1` })
    .from(schema.connectionSpaces)
    .where(
      and(
        eq(schema.connectionSpaces.userId, userId),
        eq(schema.connectionSpaces.spaceId, spaceId),
        eq(schema.connectionSpaces.provider, provider),
      ),
    );
  return !!row;
}

/** Your connection, for a read in a space: connected, and turned on there. Off is "not here", with no read made. */
export async function needOnHere(
  db: Executor,
  userId: string,
  spaceId: string,
  provider: ConnectorProvider,
): Promise<Connection> {
  const c = await connectionOf(db, userId, provider);
  if (!c) throw new ConnectorFailure('not-connected', 'You haven’t connected this app.', 404);
  if (!(await isOn(db, userId, spaceId, provider)))
    throw new ConnectorFailure('off-here', 'This app is off in this space.', 404);
  return c;
}

function clientFor(
  deps: ConnectorDeps,
  c: Pick<Connection, 'provider' | 'site' | 'tokenSealed'>,
): ConnectorClient {
  const app = connectorOf(c.provider);
  const token = deps.seal.open(c.tokenSealed);
  // A token sealed with another secret can't be read: to the person, it has stopped working.
  if (token === null) throw new ConnectorFailure('expired', app.words.expired, 401);
  return app.open(c.site, token, deps.http);
}

/**
 * Run a call against the app for a connection: an expired token flips the connection to expired; any answer marks
 * when the app was last asked, and a good one when it last answered.
 */
export async function withConnection<T, C extends ConnectorClient = ConnectorClient>(
  db: Db,
  deps: ConnectorDeps,
  c: Connection,
  fn: (client: C) => Promise<T>,
): Promise<T> {
  if (c.state === 'expired')
    throw new ConnectorFailure('expired', connectorOf(c.provider).words.expired, 401);
  const now = new Date();
  try {
    const out = await fn(clientFor(deps, c) as C);
    await db
      .update(schema.connections)
      .set({ syncedAt: now, checkedAt: now })
      .where(eq(schema.connections.id, c.id));
    c.syncedAt = now;
    return out;
  } catch (err) {
    const expired = err instanceof ConnectorFailure && err.code === 'expired';
    await db
      .update(schema.connections)
      .set({ checkedAt: now, ...(expired ? { state: 'expired' as const } : {}) })
      .where(eq(schema.connections.id, c.id));
    if (expired) c.state = 'expired';
    throw err;
  }
}

export async function viewsOf(db: Executor, connectionId: string): Promise<JiraView[]> {
  return db
    .select({
      id: schema.connectionViews.id,
      name: schema.connectionViews.name,
      jql: schema.connectionViews.query,
    })
    .from(schema.connectionViews)
    .where(eq(schema.connectionViews.connectionId, connectionId))
    .orderBy(asc(schema.connectionViews.position), asc(schema.connectionViews.createdAt));
}

/**
 * Your tasks linked to an issue in an app, in every space you are in: which issues have tasks, where they sit,
 * whether they are done. A space you left is not yours to see, so its tasks are not here.
 */
export async function linksOf(
  db: Executor,
  userId: string,
  provider: ConnectorProvider,
): Promise<JiraLink[]> {
  const rows = await db
    .select({
      key: schema.taskLinks.key,
      taskId: schema.tasks.id,
      spaceId: schema.tasks.spaceId,
      number: schema.tasks.number,
      prefix: schema.spaces.taskPrefix,
      title: schema.tasks.title,
      day: schema.tasks.day,
      doneAt: schema.tasks.doneAt,
    })
    .from(schema.taskLinks)
    .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskLinks.taskId))
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .innerJoin(
      schema.spaceMembers,
      and(eq(schema.spaceMembers.spaceId, schema.tasks.spaceId), eq(schema.spaceMembers.userId, userId)),
    )
    .where(
      and(
        eq(schema.taskLinks.provider, provider),
        eq(schema.tasks.ownerId, userId),
        isNull(schema.tasks.deletedAt),
      ),
    )
    .orderBy(asc(schema.tasks.createdAt));
  return rows.map((r) => ({
    key: r.key,
    taskId: r.taskId,
    spaceId: r.spaceId,
    ref: `${r.prefix}-${r.number}`,
    title: r.title,
    day: r.day,
    done: r.doneAt !== null,
  }));
}

async function onCount(db: Executor, userId: string, provider: ConnectorProvider): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.connectionSpaces)
    .where(and(eq(schema.connectionSpaces.userId, userId), eq(schema.connectionSpaces.provider, provider)));
  return row?.n ?? 0;
}

async function shape(
  db: Executor,
  userId: string,
  c: Connection,
  assigned: string[] | null,
): Promise<JiraConnectionResponse> {
  const links = assigned ? await linksOf(db, userId, c.provider) : [];
  return {
    connected: true,
    site: c.site,
    who: { name: c.accountName, email: c.accountEmail },
    state: c.state,
    syncedAt: c.syncedAt?.toISOString() ?? null,
    views: await viewsOf(db, c.id),
    assigned,
    count: assigned ? jiraCount(assigned, links) : null,
    onIn: await onCount(db, userId, c.provider),
  };
}

/** The connection read: what the shell, the panel and Settings show. Asks the app for the count while the token works. */
export async function readConnection(
  db: Db,
  deps: ConnectorDeps,
  userId: string,
  provider: ConnectorProvider,
): Promise<JiraConnectionResponse> {
  const c = await connectionOf(db, userId, provider);
  if (!c) return { connected: false };
  let assigned: string[] | null = null;
  if (c.state === 'ok')
    try {
      assigned = await withConnection(db, deps, c, (client) => client.assigned(COUNT_PAGE));
    } catch (err) {
      if (!(err instanceof ConnectorFailure)) throw err;
    }
  return shape(db, userId, c, assigned);
}

/**
 * Connect (or reconnect): the address is checked, then the app is asked who the token is and whether it can read
 * issues. Only then is anything kept. A second connect replaces the token and keeps the views and the switches.
 * Connecting from a space (`spaceId`) turns the app on there in the same step.
 */
export async function connect(
  db: Db,
  deps: ConnectorDeps,
  userId: string,
  provider: ConnectorProvider,
  input: { site: string; token: string; spaceId?: string },
): Promise<JiraConnectionResponse> {
  const app = connectorOf(provider);
  const problem = app.siteProblem(input.site);
  if (problem) throw new ConnectorFailure('not-address', problem, 400, 'site');
  const token = input.token.trim();
  if (!token) throw new ConnectorFailure('token-refused', 'Paste your personal access token.', 400, 'token');
  const site = app.normalSite(input.site);
  const client = app.open(site, token, deps.http);
  const who = await client.who();
  let assigned: string[];
  try {
    assigned = await client.assigned(COUNT_PAGE);
  } catch (err) {
    // On a fresh token "expired" is just the app saying no to it.
    if (err instanceof ConnectorFailure && err.code === 'no-read')
      throw new ConnectorFailure('no-read', err.message, 400, 'token');
    if (err instanceof ConnectorFailure && err.code === 'expired')
      throw new ConnectorFailure('token-refused', app.words.refused, 400, 'token');
    throw err;
  }
  const now = new Date();
  const values = {
    site,
    tokenSealed: deps.seal.seal(token),
    accountName: who.name,
    accountEmail: who.email,
    state: 'ok' as const,
    syncedAt: now,
    checkedAt: now,
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.connections)
      .values({ id: randomUUID(), userId, provider, connectedAt: now, ...values })
      .onConflictDoUpdate({ target: [schema.connections.userId, schema.connections.provider], set: values });
    if (input.spaceId) await setOnIn(tx, userId, input.spaceId, provider, true);
  });
  const c = (await connectionOf(db, userId, provider))!;
  return shape(db, userId, c, assigned);
}

/** Disconnect: the token, its views and every switch for the app go. Tasks keep their links, as words. */
export async function disconnect(db: Db, userId: string, provider: ConnectorProvider): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx
      .delete(schema.connectionSpaces)
      .where(and(eq(schema.connectionSpaces.userId, userId), eq(schema.connectionSpaces.provider, provider)));
    const gone = await tx
      .delete(schema.connections)
      .where(and(eq(schema.connections.userId, userId), eq(schema.connections.provider, provider)))
      .returning({ id: schema.connections.id });
    return gone.length > 0;
  });
}

async function setOnIn(
  db: Executor,
  userId: string,
  spaceId: string,
  provider: ConnectorProvider,
  on: boolean,
): Promise<void> {
  if (on)
    await db.insert(schema.connectionSpaces).values({ userId, spaceId, provider }).onConflictDoNothing();
  else
    await db
      .delete(schema.connectionSpaces)
      .where(
        and(
          eq(schema.connectionSpaces.userId, userId),
          eq(schema.connectionSpaces.spaceId, spaceId),
          eq(schema.connectionSpaces.provider, provider),
        ),
      );
}

/** Your switch for an app in a space. On needs a connection; asking twice changes nothing. */
export async function setOn(
  db: Db,
  userId: string,
  spaceId: string,
  provider: ConnectorProvider,
  on: boolean,
): Promise<void> {
  if (on && !(await connectionOf(db, userId, provider)))
    throw new ConnectorFailure('not-connected', 'Connect the app first.', 409);
  await setOnIn(db, userId, spaceId, provider, on);
}

/** Your spaces in the sidebar's order, with your switch for an app and how many of your tasks there are linked. */
export async function spacesOf(
  db: Executor,
  userId: string,
  provider: ConnectorProvider,
): Promise<ConnectorSpace[]> {
  const spaces = await spaceSummaries(db, userId);
  const on = new Set(
    (
      await db
        .select({ spaceId: schema.connectionSpaces.spaceId })
        .from(schema.connectionSpaces)
        .where(
          and(eq(schema.connectionSpaces.userId, userId), eq(schema.connectionSpaces.provider, provider)),
        )
    ).map((r) => r.spaceId),
  );
  const linked = new Map<string, number>();
  for (const l of await linksOf(db, userId, provider))
    linked.set(l.spaceId, (linked.get(l.spaceId) ?? 0) + 1);
  return spaces.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    color: s.color,
    on: on.has(s.id),
    linked: linked.get(s.id) ?? 0,
  }));
}

async function needConnection(
  db: Executor,
  userId: string,
  provider: ConnectorProvider,
): Promise<Connection> {
  const c = await connectionOf(db, userId, provider);
  if (!c) throw new ConnectorFailure('not-connected', 'You haven’t connected this app.', 404);
  return c;
}

export async function saveView(
  db: Db,
  userId: string,
  provider: ConnectorProvider,
  input: { name: string; jql: string; index?: number },
): Promise<JiraView> {
  const c = await needConnection(db, userId, provider);
  const views = await db
    .select()
    .from(schema.connectionViews)
    .where(eq(schema.connectionViews.connectionId, c.id))
    .orderBy(asc(schema.connectionViews.position), asc(schema.connectionViews.createdAt));
  const name = input.name.trim();
  if (views.some((v) => v.name.toLowerCase() === name.toLowerCase()))
    throw new ConnectorFailure('name-taken', `You already have a view called “${name}”.`, 409);
  // Undo puts a view back where it was; otherwise it joins the end.
  const i = input.index === undefined ? views.length : Math.max(0, Math.min(input.index, views.length));
  const before = views[i - 1]?.position ?? 0;
  const after = views[i]?.position;
  const position = after === undefined ? before + POSITION_STEP : (before + after) / 2;
  const id = randomUUID();
  const query = input.jql.trim();
  await db.insert(schema.connectionViews).values({ id, connectionId: c.id, name, query, position });
  return { id, name, jql: query };
}

export async function removeView(
  db: Db,
  userId: string,
  provider: ConnectorProvider,
  id: string,
): Promise<boolean> {
  const c = await needConnection(db, userId, provider);
  const gone = await db
    .delete(schema.connectionViews)
    .where(and(eq(schema.connectionViews.id, id), eq(schema.connectionViews.connectionId, c.id)))
    .returning({ id: schema.connectionViews.id });
  return gone.length > 0;
}
