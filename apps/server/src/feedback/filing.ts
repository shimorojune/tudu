import {
  feedbackDetailsSchema,
  feedbackRef,
  issueBody,
  issueLabels,
  issueTitle,
  type FeedbackIssue,
  type FeedbackKind,
} from '@tudu/core';
import { and, asc, count, eq, gt, isNull, lt, or, schema, sql, type Db } from '@tudu/db';
import { IssueError, type IssueTracker } from './github';

/** Issues the whole app files in an hour; past it reports wait (saved and mailed) and go later. */
export const ISSUES_PER_HOUR = 30;
/** A claim older than this is a request or sweep that died: the row is free to take again. */
export const CLAIM_STALE_MS = 2 * 60 * 1000;
/** Tries before a report gives up on GitHub (the sweep runs every five minutes: about an hour). */
export const ISSUE_MAX_ATTEMPTS = 12;
/** The sweep's pace and its batch. */
export const ISSUE_SWEEP_EVERY_MS = 5 * 60 * 1000;
export const ISSUE_SWEEP_BATCH = 10;

const HOUR_MS = 60 * 60 * 1000;

export type FileOutcome = { state: 'filed'; issue: FeedbackIssue } | { state: 'pending' | 'failed' | 'busy' };

/** Issues filed in the last hour, across everyone. */
async function filedThisHour(db: Db, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.feedback)
    .where(
      and(
        eq(schema.feedback.issueState, 'filed'),
        gt(schema.feedback.issueClaimedAt, new Date(now.getTime() - HOUR_MS)),
      ),
    );
  return row?.n ?? 0;
}

/**
 * File one waiting report as its public issue. The row is claimed first with a conditional update, so a request and
 * the sweep (or two sweeps) never both file it. Built from the row's kind, words and listed details only.
 */
export async function fileReport(
  db: Db,
  tracker: IssueTracker,
  id: string,
  opts: { now?: Date; quiet?: boolean } = {},
): Promise<FileOutcome> {
  const now = opts.now ?? new Date();
  if ((await filedThisHour(db, now)) >= ISSUES_PER_HOUR) return { state: 'pending' };
  const [row] = await db
    .update(schema.feedback)
    .set({ issueClaimedAt: now, issueAttempts: sql`${schema.feedback.issueAttempts} + 1` })
    .where(
      and(
        eq(schema.feedback.id, id),
        eq(schema.feedback.issueState, 'pending'),
        or(
          isNull(schema.feedback.issueClaimedAt),
          lt(schema.feedback.issueClaimedAt, new Date(now.getTime() - CLAIM_STALE_MS)),
        ),
      ),
    )
    .returning();
  if (!row) return { state: 'busy' };

  const details = feedbackDetailsSchema.nullable().safeParse(row.details ?? null);
  try {
    const issue = await tracker.file({
      title: issueTitle(row.text),
      body: issueBody({
        kind: row.kind as FeedbackKind,
        text: row.text,
        details: details.success ? details.data : null,
        ref: feedbackRef(row.id),
      }),
      labels: issueLabels(row.kind as FeedbackKind),
    });
    await db
      .update(schema.feedback)
      .set({ issueState: 'filed', issueNumber: issue.number, issueUrl: issue.url })
      .where(eq(schema.feedback.id, id));
    return { state: 'filed', issue };
  } catch (err) {
    const retryable = err instanceof IssueError ? err.retryable : true;
    const giveUp = !retryable || row.issueAttempts >= ISSUE_MAX_ATTEMPTS;
    if (giveUp) {
      await db.update(schema.feedback).set({ issueState: 'failed' }).where(eq(schema.feedback.id, id));
      // A refusal for good (a bad or expired token, the repository gone) needs a person: say so loudly.
      console.error(`feedback: report ${feedbackRef(id)} was not filed on GitHub and won't be retried`, err);
      return { state: 'failed' };
    }
    if (!opts.quiet) console.warn(`feedback: report ${feedbackRef(id)} waits for GitHub`, err);
    return { state: 'pending' };
  }
}

/** File what waits: oldest first, a few a run, under the hourly cap. The server runs it every five minutes. */
export async function sweepIssues(
  db: Db,
  tracker: IssueTracker,
  opts: { now?: Date; quiet?: boolean } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const waiting = await db
    .select({ id: schema.feedback.id })
    .from(schema.feedback)
    .where(
      and(
        eq(schema.feedback.issueState, 'pending'),
        or(
          isNull(schema.feedback.issueClaimedAt),
          lt(schema.feedback.issueClaimedAt, new Date(now.getTime() - CLAIM_STALE_MS)),
        ),
      ),
    )
    .orderBy(asc(schema.feedback.createdAt))
    .limit(ISSUE_SWEEP_BATCH);
  let filed = 0;
  for (const { id } of waiting) {
    const out = await fileReport(db, tracker, id, opts);
    if (out.state === 'filed') filed += 1;
    if ((await filedThisHour(db, now)) >= ISSUES_PER_HOUR) break;
  }
  return filed;
}
