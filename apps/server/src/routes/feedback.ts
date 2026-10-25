import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import {
  FEEDBACK_IMAGE_MAX,
  FEEDBACK_PER_HOUR,
  feedbackDetailsLines,
  feedbackReportSchema,
  issueTitle,
  type FeedbackIssue,
  type FeedbackReport,
  type FeedbackSent,
  type MyReports,
} from '@tudu/core';
import { and, count, desc, eq, gt, schema, type Db } from '@tudu/db';
import type { Mail, Mailer } from '../email';
import { fileReport } from '../feedback/filing';
import type { IssueTracker } from '../feedback/github';
import { cleanFileName } from '../files';
import { requireSession, type SessionVars } from '../middleware/session';
import type { Storage } from '../storage';

const HOUR_MS = 60 * 60 * 1000;
/** Your reports lists this many, newest first. */
export const MY_REPORTS_MAX = 20;

/** The mail to whoever reads reports: the words first, then who sent it and the details; the screenshot attached. */
export function feedbackMail(x: {
  to: string;
  report: FeedbackReport;
  from: { name: string; email: string };
  shot: { name: string; type: string; body: Uint8Array } | null;
  /** Its public issue, once filed; `pending` when GitHub is still to come. */
  issue?: FeedbackIssue | 'pending' | null;
}): Mail {
  const first = x.report.text.split('\n')[0]!.trim();
  const gist = first.length > 60 ? `${first.slice(0, 59)}…` : first;
  const details = x.report.details
    ? feedbackDetailsLines(x.report.details)
    : ['No app details: they switched them off.'];
  return {
    to: x.to,
    replyTo: x.from.email,
    subject: `${x.report.kind === 'bug' ? 'Something’s wrong' : 'An idea'}: ${gist}`,
    text: [
      x.report.text,
      '',
      '---',
      `From ${x.from.name} <${x.from.email}>`,
      ...details,
      x.shot ? `Screenshot: ${x.shot.name} (attached)` : 'No screenshot.',
      ...(x.issue === 'pending'
        ? ['GitHub issue: waiting for GitHub; it is filed later.']
        : x.issue
          ? [`GitHub issue: #${x.issue.number} ${x.issue.url}`]
          : []),
      `Report ${x.report.id}`,
    ].join('\n'),
    attachments: x.shot ? [{ filename: x.shot.name, content: x.shot.body, type: x.shot.type }] : undefined,
  };
}

type Row = typeof schema.feedback.$inferSelect;

/** The answer for a saved report: its issue once filed, and whether one is still to come. */
function sentOf(row: Pick<Row, 'id' | 'issueState' | 'issueNumber' | 'issueUrl'>): FeedbackSent {
  const issue =
    row.issueState === 'filed' && row.issueNumber != null && row.issueUrl
      ? { number: row.issueNumber, url: row.issueUrl }
      : null;
  return { id: row.id, issue, pending: row.issueState === 'pending' };
}

/**
 * Send feedback (chunk 19): one report as form data (`report`, its JSON, and an optional `screenshot`). Saved first,
 * then filed as a public GitHub issue when a tracker is set (only by the request that saved it, so a retry or a
 * double click never files twice), then mailed to FEEDBACK_TO with the private parts. A mail that fails leaves the
 * row; GitHub down leaves it `pending` for the sweep. The client's id makes a retry one report.
 */
export function feedbackRoutes(
  db: Db,
  storage: Storage,
  mailer: Mailer,
  to: string | undefined,
  tracker: IssueTracker | null = null,
) {
  const r = new Hono<{ Variables: SessionVars }>();

  r.get('/feedback/mine', requireSession, async (c) => {
    const user = c.get('session')!.user;
    const rows = await db
      .select()
      .from(schema.feedback)
      .where(eq(schema.feedback.userId, user.id))
      .orderBy(desc(schema.feedback.createdAt))
      .limit(MY_REPORTS_MAX);
    const out: MyReports = {
      filing: tracker ? 'github' : 'email',
      reports: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: issueTitle(row.text),
        createdAt: row.createdAt.toISOString(),
        state: row.issueState,
        issue: sentOf(row).issue,
      })),
    };
    return c.json(out, 200);
  });

  r.post('/feedback', requireSession, async (c) => {
    const user = c.get('session')!.user;
    const length = Number(c.req.header('content-length') ?? 0);
    if (length > FEEDBACK_IMAGE_MAX + 64 * 1024)
      return c.json({ error: 'That screenshot is too big. It can be up to 10 MB.' }, 413);
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: 'Send the report as form data.' }, 400);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(String(form.get('report') ?? ''));
    } catch {
      return c.json({ error: 'The report didn’t come through.' }, 400);
    }
    const parsed = feedbackReportSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]!.message }, 400);
    const report = parsed.data;
    const file = form.get('screenshot');
    if (file !== null && !(file instanceof File))
      return c.json({ error: 'The screenshot didn’t come through.' }, 400);
    if (file && !/^image\//.test(file.type))
      return c.json({ error: 'The screenshot has to be an image.' }, 400);
    if (file && file.size > FEEDBACK_IMAGE_MAX)
      return c.json({ error: 'That screenshot is too big. It can be up to 10 MB.' }, 400);

    const [seen] = await db
      .select()
      .from(schema.feedback)
      .where(and(eq(schema.feedback.userId, user.id), eq(schema.feedback.reportId, report.id)));
    if (seen) return c.json(sentOf(seen), 200);

    const [recent] = await db
      .select({ n: count() })
      .from(schema.feedback)
      .where(
        and(
          eq(schema.feedback.userId, user.id),
          gt(schema.feedback.createdAt, new Date(Date.now() - HOUR_MS)),
        ),
      );
    if ((recent?.n ?? 0) >= FEEDBACK_PER_HOUR)
      return c.json({ error: 'That’s a lot of reports in an hour. Your words are kept; send it a little later.' }, 429);

    const id = randomUUID();
    let shot: { name: string; type: string; body: Uint8Array; key: string } | null = null;
    if (file && file.size) {
      const name = cleanFileName(file.name || 'Screenshot.png');
      const key = `feedback/${id}/${name}`;
      const body = new Uint8Array(await file.arrayBuffer());
      await storage.put(key, body, file.type);
      shot = { name, type: file.type, body, key };
    }
    const [row] = await db
      .insert(schema.feedback)
      .values({
        id,
        userId: user.id,
        reportId: report.id,
        kind: report.kind,
        text: report.text,
        details: report.details,
        screenshotKey: shot?.key ?? null,
        issueState: tracker ? 'pending' : 'none',
      })
      .onConflictDoNothing()
      .returning({ id: schema.feedback.id });
    if (!row) {
      // The same report landed a moment ago from a retry: that one stands.
      if (shot) await storage.delete(shot.key).catch(() => {});
      const [first] = await db
        .select()
        .from(schema.feedback)
        .where(and(eq(schema.feedback.userId, user.id), eq(schema.feedback.reportId, report.id)));
      return c.json(first ? sentOf(first) : { id, issue: null, pending: false }, 200);
    }

    let sent: FeedbackSent = { id, issue: null, pending: false };
    if (tracker) {
      const out = await fileReport(db, tracker, id, { quiet: true });
      sent =
        out.state === 'filed'
          ? { id, issue: out.issue, pending: false }
          : { id, issue: null, pending: out.state !== 'failed' };
    }

    if (to) {
      try {
        await mailer.send(
          feedbackMail({
            to,
            report,
            from: { name: user.name, email: user.email },
            shot,
            issue: sent.issue ?? (sent.pending ? 'pending' : null),
          }),
        );
      } catch (err) {
        // The row is saved; whoever reads reports can find it there.
        console.error('feedback: the mail failed', err);
      }
    }
    return c.json(sent, 200);
  });

  return r;
}
