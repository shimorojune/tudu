import { allDone, type GettingStarted, type GettingStartedRecord } from '@tudu/core';
import { and, eq, schema, sql, type Db } from '@tudu/db';

/**
 * Where a person stands with Getting started. Each row is read from the real thing: a name on the account, a task
 * they wrote (in any space, crossed off or deleted since), a connection to Jira in any space. Only the theme leaves
 * no row of its own, so the web records it on the user. The card is open until it is hidden or all four are done.
 */
export async function gettingStarted(db: Db, userId: string): Promise<GettingStarted> {
  const [row] = await db
    .select({
      name: schema.user.name,
      firstRun: schema.user.firstRun,
      task: sql<boolean>`exists (select 1 from ${schema.tasks} where ${schema.tasks.createdBy} = ${userId})`,
      jira: sql<boolean>`exists (select 1 from ${schema.jiraConnections} where ${schema.jiraConnections.userId} = ${userId})`,
    })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  const done = {
    name: !!row?.name.trim(),
    task: !!row?.task,
    theme: !!row?.firstRun?.themeAt,
    jira: !!row?.jira,
  };
  return { open: !row?.firstRun?.hiddenAt && !allDone(done), done };
}

/** Read `POST /api/me/getting-started`'s body: `{ theme: true }` or `{ hidden: true }`, nothing else. */
export function parseRecord(body: unknown): GettingStartedRecord | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== 1) return null;
  const b = body as Record<string, unknown>;
  if (b.theme === true) return { theme: true };
  if (b.hidden === true) return { hidden: true };
  return null;
}

/** Record a theme pick or a hide. The first time stands, so asking again changes nothing. */
export async function recordFirstRun(db: Db, userId: string, rec: GettingStartedRecord): Promise<void> {
  const key = 'theme' in rec ? 'themeAt' : 'hiddenAt';
  const now = new Date().toISOString();
  await db
    .update(schema.user)
    .set({
      firstRun: sql`coalesce(${schema.user.firstRun}, '{}'::jsonb) || jsonb_build_object(${key}::text, coalesce(${schema.user.firstRun} ->> ${key}::text, ${now}::text))`,
    })
    .where(eq(schema.user.id, userId));
}

/** A new account: its first session, made a moment later in the same sign-in, is the one that made it. */
export async function markNewAccount(db: Db, userId: string): Promise<void> {
  await db
    .update(schema.user)
    .set({
      firstRun: sql`coalesce(${schema.user.firstRun}, '{}'::jsonb) || '{"firstSession":"pending"}'::jsonb`,
    })
    .where(eq(schema.user.id, userId));
}

/** The first session after the account was made takes the mark; every later sign-in is a returning one. */
export async function takeFirstSession(db: Db, userId: string, sessionId: string): Promise<void> {
  await db
    .update(schema.user)
    .set({ firstRun: sql`${schema.user.firstRun} || jsonb_build_object('firstSession', ${sessionId}::text)` })
    .where(and(eq(schema.user.id, userId), sql`${schema.user.firstRun} ->> 'firstSession' = 'pending'`));
}

/** Whether this session is the sign-in that made the account. */
export async function isFirstSession(db: Db, userId: string, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ firstRun: schema.user.firstRun })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  return row?.firstRun?.firstSession === sessionId;
}
