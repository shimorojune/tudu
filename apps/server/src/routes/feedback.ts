import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import {
  FEEDBACK_IMAGE_MAX,
  FEEDBACK_PER_HOUR,
  feedbackDetailsLines,
  feedbackReportSchema,
  issueTitle,
  shotCanBePublic,
  similarReady,
  type SimilarIssues,
  type FeedbackIssue,
  type FeedbackReport,
  type FeedbackSent,
  type MyReports,
} from '@tudu/core';
import { and, count, desc, eq, gt, like, schema, type Db } from '@tudu/db';
import type { Mail, Mailer } from '../email';
import type { Embeddings } from '../closeMatches';
import { fileReport } from '../feedback/filing';
import type { IssueTracker } from '../feedback/github';
import { searchSimilarIssues, SimilarUnavailable, type IssueMirror } from '../feedback/issueMirror';
import { shotSigMatches, type ShotLinks } from '../feedback/shots';
import { cleanFileName } from '../files';
import { requireSession, type SessionVars } from '../middleware/session';
import type { Storage } from '../storage';

const HOUR_MS = 60 * 60 * 1000;
/** Your reports lists this many, newest first. */
export const MY_REPORTS_MAX = 20;
/** Similar looks one person may make in a minute (the form looks once per pause in typing). */
export const SIMILAR_PER_MINUTE = 30;
/** What a +1 to an issue that can't take one answers: the words stay, and it can go as a new report. */
export const CANT_PLUS_ONE = 'That issue can’t take comments now. Send it as a new report instead.';

/** The mail to whoever reads reports: the words first, then who sent it and the details; the screenshot attached. */
export function feedbackMail(x: {
  to: string;
  report: FeedbackReport;
  from: { name: string; email: string };
  /** `public`: its sender chose to show it on the GitHub issue. */
  shot: { name: string; type: string; body: Uint8Array; public?: boolean } | null;
  /** Its public issue, once filed; `pending` when GitHub is still to come. */
  issue?: FeedbackIssue | 'pending' | null;
}): Mail {
  const first = x.report.text.split('\n')[0]!.trim();
  const gist = first.length > 60 ? `${first.slice(0, 59)}…` : first;
  const plusOne = x.report.plusOneOf;
  const details = x.report.details
    ? feedbackDetailsLines(x.report.details)
    : ['No app details: they switched them off.'];
  return {
    to: x.to,
    replyTo: x.from.email,
    subject: `${plusOne ? `+1 on #${plusOne}` : x.report.kind === 'bug' ? 'Something’s wrong' : 'An idea'}: ${gist}`,
    text: [
      x.report.text,
      '',
      '---',
      `From ${x.from.name} <${x.from.email}>`,
      ...details,
      x.shot
        ? `Screenshot: ${x.shot.name} (attached, ${x.shot.public ? 'shown on the issue' : 'private'})`
        : 'No screenshot.',
      ...(plusOne
        ? [`+1 on #${plusOne} (${x.report.kind === 'bug' ? 'something’s wrong' : 'an idea'})`]
        : []),
      ...(x.issue === 'pending'
        ? [
            plusOne
              ? 'GitHub comment: waiting for GitHub; it is posted later.'
              : 'GitHub issue: waiting for GitHub; it is filed later.',
          ]
        : x.issue
          ? [plusOne ? `GitHub comment: ${x.issue.url}` : `GitHub issue: #${x.issue.number} ${x.issue.url}`]
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
  shots?: ShotLinks,
  similar: { mirror?: IssueMirror | null; embeddings?: Embeddings } = {},
) {
  const r = new Hono<{ Variables: SessionVars }>();
  const mirror = tracker ? (similar.mirror ?? null) : null;
  const looks = new Map<string, number[]>();

  // Similar reports (#76): existing issues, open and closed, that mean what is being typed. Only with GitHub
  // filing; 503 when it can't tell, so an empty list always means "nothing similar".
  if (mirror && similar.embeddings) {
    const embeddings = similar.embeddings;
    r.get('/feedback/similar', requireSession, async (c) => {
      const user = c.get('session')!.user;
      const q = c.req.query('q') ?? '';
      if (!similarReady(q)) return c.json({ issues: [] } satisfies SimilarIssues, 200);
      const now = Date.now();
      const recent = (looks.get(user.id) ?? []).filter((t) => t > now - 60_000);
      if (recent.length >= SIMILAR_PER_MINUTE) {
        looks.set(user.id, recent);
        return c.json({ error: 'That’s a lot of looks in a minute. Try again shortly.' }, 429);
      }
      recent.push(now);
      looks.set(user.id, recent);
      try {
        const issues = await searchSimilarIssues(db, embeddings, mirror, user.id, q);
        return c.json({ issues } satisfies SimilarIssues, 200);
      } catch (err) {
        if (err instanceof SimilarUnavailable) return c.json({ error: err.message }, 503);
        throw err;
      }
    });
  }

  // A screenshot its sender chose to show on the public issue, for GitHub's image proxy: no session, only the
  // signed link. Anything else (unknown, unsigned, private, gone) is the same 404, so a link can't be probed.
  r.get('/feedback/shots/:ref/:sig', async (c) => {
    const missing = () => c.json({ error: 'Not found.' }, 404);
    const { ref, sig } = c.req.param();
    if (!shots || !/^[0-9a-f]{8}$/.test(ref)) return missing();
    // The reference is the id's first eight characters; the signature picks the one report among any that share it.
    const shown = await db
      .select({ id: schema.feedback.id, key: schema.feedback.screenshotKey })
      .from(schema.feedback)
      .where(and(like(schema.feedback.id, `${ref}-%`), eq(schema.feedback.screenshotPublic, true)));
    const row = shown.find((x) => shotSigMatches(shots.secret, x.id, sig));
    if (!row?.key) return missing();
    const obj = await storage.get(row.key);
    if (!obj || !shotCanBePublic(obj.type)) return missing();
    c.header('content-type', obj.type);
    if (obj.size) c.header('content-length', String(obj.size));
    c.header('content-disposition', 'inline');
    c.header('content-security-policy', "default-src 'none'; sandbox");
    c.header('cache-control', 'public, max-age=3600');
    c.header('x-content-type-options', 'nosniff');
    return stream(c, async (s) => {
      for await (const chunk of obj.body) await s.write(chunk as Uint8Array);
    });
  });

  r.get('/feedback/mine', requireSession, async (c) => {
    const user = c.get('session')!.user;
    const rows = await db
      .select()
      .from(schema.feedback)
      .where(eq(schema.feedback.userId, user.id))
      .orderBy(desc(schema.feedback.createdAt))
      .limit(MY_REPORTS_MAX);
    const titles = mirror
      ? await mirror.titleOf([...new Set(rows.flatMap((x) => (x.plusOneOf != null ? [x.plusOneOf] : [])))])
      : new Map<number, string>();
    const out: MyReports = {
      filing: tracker ? 'github' : 'email',
      reports: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        plusOneOf: row.plusOneOf,
        title: (row.plusOneOf != null ? titles.get(row.plusOneOf) : undefined) ?? issueTitle(row.text),
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
      return c.json(
        { error: 'That’s a lot of reports in an hour. Your words are kept; send it a little later.' },
        429,
      );

    // A +1 goes on an issue the mirror knows and that isn't locked; anything else is said before anything is saved.
    if (report.plusOneOf != null && (!tracker || !mirror || !(await mirror.canTakePlusOne(report.plusOneOf))))
      return c.json({ error: CANT_PLUS_ONE }, 409);

    const id = randomUUID();
    let shot: { name: string; type: string; body: Uint8Array; key: string; public: boolean } | null = null;
    if (file && file.size) {
      const name = cleanFileName(file.name || 'Screenshot.png');
      const key = `feedback/${id}/${name}`;
      const body = new Uint8Array(await file.arrayBuffer());
      await storage.put(key, body, file.type);
      // Only kinds GitHub shows inline go public; the form disables the switch for the rest.
      shot = { name, type: file.type, body, key, public: report.shotPublic && shotCanBePublic(file.type) };
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
        screenshotPublic: shot?.public ?? false,
        issueState: tracker ? 'pending' : 'none',
        plusOneOf: report.plusOneOf,
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
      const out = await fileReport(db, tracker, id, { quiet: true, shots, mirror, refuse: true });
      if (out.state === 'refused') {
        // GitHub won't take it on that issue (locked or gone since the mirror read it): nothing is kept, so the
        // person can send the same words as a new report.
        await db.delete(schema.feedback).where(eq(schema.feedback.id, id));
        if (shot) await storage.delete(shot.key).catch(() => {});
        return c.json({ error: CANT_PLUS_ONE }, 409);
      }
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
