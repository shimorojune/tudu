import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import {
  FEEDBACK_IMAGE_MAX,
  FEEDBACK_PER_HOUR,
  feedbackDetailsLines,
  feedbackReportSchema,
  type FeedbackReport,
} from '@tudu/core';
import { and, count, eq, gt, schema, type Db } from '@tudu/db';
import type { Mail, Mailer } from '../email';
import { cleanFileName } from '../files';
import { requireSession, type SessionVars } from '../middleware/session';
import type { Storage } from '../storage';

const HOUR_MS = 60 * 60 * 1000;

/** The mail to whoever reads reports: the words first, then who sent it and the details; the screenshot attached. */
export function feedbackMail(x: {
  to: string;
  report: FeedbackReport;
  from: { name: string; email: string };
  shot: { name: string; type: string; body: Uint8Array } | null;
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
      `Report ${x.report.id}`,
    ].join('\n'),
    attachments: x.shot ? [{ filename: x.shot.name, content: x.shot.body, type: x.shot.type }] : undefined,
  };
}

/**
 * Send feedback (chunk 19): one report as form data (`report`, its JSON, and an optional `screenshot`). Saved first,
 * then mailed to FEEDBACK_TO; a mail that fails leaves the row, so nothing is lost. The client's id makes a retry
 * one report.
 */
export function feedbackRoutes(db: Db, storage: Storage, mailer: Mailer, to: string | undefined) {
  const r = new Hono<{ Variables: SessionVars }>();

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
      .select({ id: schema.feedback.id })
      .from(schema.feedback)
      .where(and(eq(schema.feedback.userId, user.id), eq(schema.feedback.reportId, report.id)));
    if (seen) return c.json({ id: seen.id }, 200);

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
      return c.json({ error: 'That’s a lot of reports in an hour. Try again a little later.' }, 429);

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
      })
      .onConflictDoNothing()
      .returning({ id: schema.feedback.id });
    if (!row) {
      // The same report landed a moment ago from a retry: that one stands.
      if (shot) await storage.delete(shot.key).catch(() => {});
      const [first] = await db
        .select({ id: schema.feedback.id })
        .from(schema.feedback)
        .where(and(eq(schema.feedback.userId, user.id), eq(schema.feedback.reportId, report.id)));
      return c.json({ id: first?.id ?? id }, 200);
    }

    if (to) {
      try {
        await mailer.send(feedbackMail({ to, report, from: { name: user.name, email: user.email }, shot }));
      } catch (err) {
        // The row is saved; whoever reads reports can find it there.
        console.error('feedback: the mail failed', err);
      }
    }
    return c.json({ id }, 200);
  });

  return r;
}
