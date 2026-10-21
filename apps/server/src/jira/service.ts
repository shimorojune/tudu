import { randomUUID } from 'node:crypto';
import {
  JIRA_ASSIGNED_JQL,
  JIRA_ASSIGNED_VIEW,
  JIRA_PAGE,
  jiraCount,
  normalSite,
  parseJiraKey,
  POSITION_STEP,
  siteProblem,
  type JiraConnectionResponse,
  type JiraIssue,
  type JiraIssueDetail,
  type JiraIssuesResponse,
  type JiraLink,
  type JiraView,
} from '@tudu/core';
import { and, asc, eq, isNotNull, isNull, schema, type Db } from '@tudu/db';
import { EXPIRED, JiraFailure, JiraHttp, type JiraHttpOptions } from './http';
import type { TokenSeal } from './seal';

export interface JiraDeps {
  seal: TokenSeal;
  http: Omit<JiraHttpOptions, 'fetch'> & { fetch?: typeof fetch };
}

type Connection = typeof schema.jiraConnections.$inferSelect;

/** The count reads at most this many of your assigned issues. */
const COUNT_PAGE = 100;

export async function connectionOf(db: Db, userId: string, spaceId: string): Promise<Connection | null> {
  const [row] = await db
    .select()
    .from(schema.jiraConnections)
    .where(and(eq(schema.jiraConnections.userId, userId), eq(schema.jiraConnections.spaceId, spaceId)));
  return row ?? null;
}

function httpFor(deps: JiraDeps, c: Pick<Connection, 'site' | 'tokenSealed'>): JiraHttp {
  const token = deps.seal.open(c.tokenSealed);
  // A token sealed with another secret can't be read: to the person, it has stopped working.
  if (token === null) throw new JiraFailure('expired', EXPIRED, 401);
  return new JiraHttp(c.site, token, deps.http);
}

/**
 * Run a call against Jira for a connection: an expired token flips the connection to expired; any answer marks
 * when Jira was last asked, and a good one when it last answered.
 */
async function withJira<T>(
  db: Db,
  deps: JiraDeps,
  c: Connection,
  fn: (h: JiraHttp) => Promise<T>,
): Promise<T> {
  if (c.state === 'expired') throw new JiraFailure('expired', EXPIRED, 401);
  const now = new Date();
  try {
    const out = await fn(httpFor(deps, c));
    await db
      .update(schema.jiraConnections)
      .set({ syncedAt: now, checkedAt: now })
      .where(eq(schema.jiraConnections.id, c.id));
    c.syncedAt = now;
    return out;
  } catch (err) {
    const expired = err instanceof JiraFailure && err.code === 'expired';
    await db
      .update(schema.jiraConnections)
      .set({ checkedAt: now, ...(expired ? { state: 'expired' as const } : {}) })
      .where(eq(schema.jiraConnections.id, c.id));
    if (expired) c.state = 'expired';
    throw err;
  }
}

export async function viewsOf(db: Db, connectionId: string): Promise<JiraView[]> {
  const rows = await db
    .select({ id: schema.jiraViews.id, name: schema.jiraViews.name, jql: schema.jiraViews.jql })
    .from(schema.jiraViews)
    .where(eq(schema.jiraViews.connectionId, connectionId))
    .orderBy(asc(schema.jiraViews.position), asc(schema.jiraViews.createdAt));
  return rows;
}

/** Your tasks in a space that carry a Jira key: which issues have tasks, where they sit, whether they are done. */
export async function linksOf(db: Db, userId: string, spaceId: string): Promise<JiraLink[]> {
  const rows = await db
    .select({
      key: schema.tasks.jiraKey,
      taskId: schema.tasks.id,
      number: schema.tasks.number,
      prefix: schema.spaces.taskPrefix,
      title: schema.tasks.title,
      day: schema.tasks.day,
      doneAt: schema.tasks.doneAt,
    })
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(
      and(
        eq(schema.tasks.spaceId, spaceId),
        eq(schema.tasks.ownerId, userId),
        isNotNull(schema.tasks.jiraKey),
        isNull(schema.tasks.deletedAt),
      ),
    )
    .orderBy(asc(schema.tasks.createdAt));
  return rows.map((r) => ({
    key: r.key!,
    taskId: r.taskId,
    ref: `${r.prefix}-${r.number}`,
    title: r.title,
    day: r.day,
    done: r.doneAt !== null,
  }));
}

async function shape(
  db: Db,
  userId: string,
  c: Connection,
  assigned: string[] | null,
): Promise<JiraConnectionResponse> {
  const links = assigned ? await linksOf(db, userId, c.spaceId) : [];
  return {
    connected: true,
    site: c.site,
    who: { name: c.jiraName, email: c.jiraEmail },
    state: c.state,
    syncedAt: c.syncedAt?.toISOString() ?? null,
    views: await viewsOf(db, c.id),
    assigned,
    count: assigned ? jiraCount(assigned, links) : null,
  };
}

/** The connection read: what the shell, the panel and Settings show. Asks Jira for the count while the token works. */
export async function readConnection(
  db: Db,
  deps: JiraDeps,
  userId: string,
  spaceId: string,
): Promise<JiraConnectionResponse> {
  const c = await connectionOf(db, userId, spaceId);
  if (!c) return { connected: false };
  let assigned: string[] | null = null;
  if (c.state === 'ok')
    try {
      const r = await withJira(db, deps, c, (h) => h.search(JIRA_ASSIGNED_JQL, COUNT_PAGE, 'key'));
      assigned = r.issues.map((i) => i.key);
    } catch (err) {
      if (!(err instanceof JiraFailure)) throw err;
    }
  return shape(db, userId, c, assigned);
}

/**
 * Connect (or reconnect): the address is checked, then Jira is asked who the token is and whether it can read
 * issues. Only then is anything kept. A second connect replaces the token and keeps the views.
 */
export async function connect(
  db: Db,
  deps: JiraDeps,
  userId: string,
  spaceId: string,
  input: { site: string; token: string },
): Promise<JiraConnectionResponse> {
  const problem = siteProblem(input.site);
  if (problem) throw new JiraFailure('not-address', problem, 400, 'site');
  const token = input.token.trim();
  if (!token) throw new JiraFailure('token-refused', 'Paste your personal access token.', 400, 'token');
  const site = normalSite(input.site);
  const h = new JiraHttp(site, token, deps.http);
  const who = await h.myself();
  let assigned: string[];
  try {
    assigned = (await h.search(JIRA_ASSIGNED_JQL, COUNT_PAGE, 'key')).issues.map((i) => i.key);
  } catch (err) {
    // On a fresh token "expired" is just Jira saying no to it.
    if (err instanceof JiraFailure && err.code === 'no-read')
      throw new JiraFailure('no-read', err.message, 400, 'token');
    if (err instanceof JiraFailure && err.code === 'expired')
      throw new JiraFailure(
        'token-refused',
        'Jira didn’t accept this token. Check it, or make a new one.',
        400,
        'token',
      );
    throw err;
  }
  const now = new Date();
  const values = {
    site,
    tokenSealed: deps.seal.seal(token),
    jiraName: who.name,
    jiraEmail: who.email,
    state: 'ok' as const,
    syncedAt: now,
    checkedAt: now,
  };
  await db
    .insert(schema.jiraConnections)
    .values({ id: randomUUID(), userId, spaceId, connectedAt: now, ...values })
    .onConflictDoUpdate({
      target: [schema.jiraConnections.userId, schema.jiraConnections.spaceId],
      set: values,
    });
  const c = (await connectionOf(db, userId, spaceId))!;
  return shape(db, userId, c, assigned);
}

export async function disconnect(db: Db, userId: string, spaceId: string): Promise<boolean> {
  const gone = await db
    .delete(schema.jiraConnections)
    .where(and(eq(schema.jiraConnections.userId, userId), eq(schema.jiraConnections.spaceId, spaceId)))
    .returning({ id: schema.jiraConnections.id });
  return gone.length > 0;
}

async function needConnection(db: Db, userId: string, spaceId: string): Promise<Connection> {
  const c = await connectionOf(db, userId, spaceId);
  if (!c) throw new JiraFailure('not-connected', 'Jira isn’t connected in this space.', 404);
  return c;
}

/** One list: the assigned view, a saved view by id, or a JQL of your own, in Jira's order. */
export async function issues(
  db: Db,
  deps: JiraDeps,
  userId: string,
  spaceId: string,
  ask: { view?: string; jql?: string },
): Promise<JiraIssuesResponse> {
  const c = await needConnection(db, userId, spaceId);
  let jql: string;
  if (ask.jql !== undefined) jql = ask.jql.trim();
  else if (!ask.view || ask.view === JIRA_ASSIGNED_VIEW) jql = JIRA_ASSIGNED_JQL;
  else {
    const v = (await viewsOf(db, c.id)).find((x) => x.id === ask.view);
    if (!v) throw new JiraFailure('not-found', 'That view isn’t there any more.', 404);
    jql = v.jql;
  }
  if (!jql) throw new JiraFailure('jql', 'Write a JQL query first.', 400);
  const r = await withJira(db, deps, c, (h) => h.search(jql, JIRA_PAGE));
  return { issues: r.issues, total: r.total, syncedAt: c.syncedAt!.toISOString() };
}

export async function issue(
  db: Db,
  deps: JiraDeps,
  userId: string,
  spaceId: string,
  key: string,
): Promise<JiraIssueDetail> {
  const c = await needConnection(db, userId, spaceId);
  const k = parseJiraKey(key);
  if (!k) throw new JiraFailure('not-found', 'That isn’t a Jira issue key.', 404);
  return withJira(db, deps, c, (h) => h.issue(k));
}

/** A word for JQL's text search: its quotes and backslashes escaped, Jira's reserved characters dropped. */
function jqlText(q: string): string {
  return q
    .replace(/[+\-&|!(){}[\]^~*?:\\/"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Search across all of Jira: a key typed in full first, then summaries and text that hold the words. */
export async function searchJira(
  db: Db,
  deps: JiraDeps,
  userId: string,
  spaceId: string,
  q: string,
): Promise<JiraIssuesResponse> {
  const c = await needConnection(db, userId, spaceId);
  const words = jqlText(q);
  const key = parseJiraKey(q);
  return withJira(db, deps, c, async (h) => {
    const out: JiraIssue[] = [];
    if (key)
      try {
        const d = await h.issue(key);
        out.push({ key: d.key, summary: d.summary, status: d.status, due: d.due, updated: d.updated });
      } catch (err) {
        if (!(err instanceof JiraFailure) || err.code !== 'not-found') throw err;
      }
    let total = out.length;
    if (words && (!key || !out.length)) {
      const r = await h.search(`text ~ "${words}" ORDER BY updated DESC`, JIRA_PAGE);
      for (const i of r.issues) if (!out.some((x) => x.key === i.key)) out.push(i);
      total = Math.max(r.total, out.length);
    }
    return { issues: out, total, syncedAt: new Date().toISOString() };
  });
}

export async function saveView(
  db: Db,
  userId: string,
  spaceId: string,
  input: { name: string; jql: string; index?: number },
): Promise<JiraView> {
  const c = await needConnection(db, userId, spaceId);
  const views = await db
    .select()
    .from(schema.jiraViews)
    .where(eq(schema.jiraViews.connectionId, c.id))
    .orderBy(asc(schema.jiraViews.position), asc(schema.jiraViews.createdAt));
  const name = input.name.trim();
  if (views.some((v) => v.name.toLowerCase() === name.toLowerCase()))
    throw new JiraFailure('name-taken', `You already have a view called “${name}”.`, 409);
  // Undo puts a view back where it was; otherwise it joins the end.
  const i = input.index === undefined ? views.length : Math.max(0, Math.min(input.index, views.length));
  const before = views[i - 1]?.position ?? 0;
  const after = views[i]?.position;
  const position = after === undefined ? before + POSITION_STEP : (before + after) / 2;
  const id = randomUUID();
  await db.insert(schema.jiraViews).values({ id, connectionId: c.id, name, jql: input.jql.trim(), position });
  return { id, name, jql: input.jql.trim() };
}

export async function removeView(db: Db, userId: string, spaceId: string, id: string): Promise<boolean> {
  const c = await needConnection(db, userId, spaceId);
  const gone = await db
    .delete(schema.jiraViews)
    .where(and(eq(schema.jiraViews.id, id), eq(schema.jiraViews.connectionId, c.id)))
    .returning({ id: schema.jiraViews.id });
  return gone.length > 0;
}
