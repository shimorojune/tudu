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
import type { IssueMirror } from './issueMirror';
import { shotUrl, type ShotLinks } from './shots';

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

export type FileOutcome =
  | { state: 'filed'; issue: FeedbackIssue }
  /** `refused`: a +1 GitHub won't take for good, with `refuse` on: the caller tells the person and drops the row. */
  | { state: 'pending' | 'failed' | 'busy' | 'refused' };

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

/** How filing runs: the clock, whether to log a wait, and where public screenshots are served from. */
export interface FileOptions {
  now?: Date;
  quiet?: boolean;
  /** Without it no screenshot is embedded, whatever its sender chose. */
  shots?: ShotLinks;
  /** A new issue goes into the mirror at once, so the similar search finds it (#76). */
  mirror?: IssueMirror | null;
  /**
   * The request that saved the row: a +1 GitHub refuses for good (locked, gone) answers `refused`, so the person can
   * send it as a new report. Without it (the sweep, nobody waiting) such a +1 is filed as a new issue instead.
   */
  refuse?: boolean;
}

/** GitHub's answers that mean the issue can't take a comment now: locked (403), gone (404, 410), refused (422). */
function cantTakeComment(err: unknown): boolean {
  return (
    err instanceof IssueError && !err.retryable && [403, 404, 410, 422].includes(err.status ?? 0)
  );
}

/**
 * File one waiting report as its public issue. The row is claimed first with a conditional update, so a request and
 * the sweep (or two sweeps) never both file it. Built from the row's kind, words and listed details only, plus the
 * screenshot's link when its sender chose to show it.
 */
export async function fileReport(
  db: Db,
  tracker: IssueTracker,
  id: string,
  opts: FileOptions = {},
): Promise<FileOutcome> {
  const now = opts.now ?? new Date();
  if ((await filedThisHour(db, now)) >= (tracker.perHour ?? ISSUES_PER_HOUR)) return { state: 'pending' };
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
  const body = (extra: { plusOne?: boolean; similarTo?: number | null }) =>
    issueBody({
      kind: row.kind as FeedbackKind,
      text: row.text,
      details: details.success ? details.data : null,
      ref: feedbackRef(row.id),
      shot: row.screenshotPublic && row.screenshotKey && opts.shots ? shotUrl(opts.shots, row.id) : null,
      ...extra,
    });
  const fileNew = async (similarTo: number | null): Promise<FeedbackIssue> => {
    const draft = {
      title: issueTitle(row.text),
      body: body({ similarTo }),
      labels: issueLabels(row.kind as FeedbackKind),
    };
    const issue = await tracker.file(draft);
    await opts.mirror?.filed(issue, draft.title, draft.body).catch((err) => {
      if (!opts.quiet) console.warn('feedback: the new issue did not go into the mirror', err);
    });
    return issue;
  };
  try {
    let issue: FeedbackIssue;
    let plusOneOf = row.plusOneOf;
    if (plusOneOf != null) {
      try {
        issue = await tracker.comment(plusOneOf, body({ plusOne: true }));
      } catch (err) {
        if (!cantTakeComment(err)) throw err;
        if (opts.refuse) {
          await db.update(schema.feedback).set({ issueClaimedAt: null }).where(eq(schema.feedback.id, id));
          return { state: 'refused' };
        }
        // Nobody is waiting: the report still gets filed, as a new issue that says which one it meant.
        issue = await fileNew(plusOneOf);
        plusOneOf = null;
      }
    } else {
      issue = await fileNew(null);
    }
    await db
      .update(schema.feedback)
      .set({ issueState: 'filed', issueNumber: issue.number, issueUrl: issue.url, plusOneOf })
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
export async function sweepIssues(db: Db, tracker: IssueTracker, opts: FileOptions = {}): Promise<number> {
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
    if ((await filedThisHour(db, now)) >= (tracker.perHour ?? ISSUES_PER_HOUR)) break;
  }
  return filed;
}
