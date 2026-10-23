import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { feedbackDetails, type FeedbackReport } from '@tudu/core';
import { eq, schema, sql } from '@tudu/db';
import type { MemoryStorage } from './storage';
import { signIn, startServer, type Jar } from '../test/harness';

const TO = 'reports@tudu.test';
let server: ReturnType<typeof startServer>;
beforeAll(() => {
  server = startServer({ FEEDBACK_TO: TO });
});
afterAll(async () => {
  await server.close();
});
beforeEach(() => {
  server.outbox.failing = false;
});

const DETAILS = feedbackDetails({
  version: '0.38.0',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0.0.0 Safari/537.36',
  view: 'today',
  spaceKind: 'personal',
  width: 1440,
  height: 900,
  theme: 'light',
});

function report(over: Partial<FeedbackReport> = {}): FeedbackReport {
  return {
    id: randomUUID(),
    kind: 'bug',
    text: 'The tick did not stick.\nIt came back after a reload.',
    details: DETAILS,
    ...over,
  };
}

/** A PNG's first bytes and some more, so it is an image of a size. */
function png(bytes = 2048): File {
  const body = new Uint8Array(bytes);
  body.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([body], 'Screenshot.png', { type: 'image/png' });
}

function send(jar: Jar | null, r: unknown, shot?: File): Promise<Response> {
  const form = new FormData();
  form.set('report', typeof r === 'string' ? r : JSON.stringify(r));
  if (shot) form.set('screenshot', shot);
  return Promise.resolve(
    server.app.request('/api/feedback', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', ...(jar ? { cookie: jar.header() } : {}) },
      body: form,
    }),
  );
}

const rowsOf = (reportId: string) =>
  server.db.select().from(schema.feedback).where(eq(schema.feedback.reportId, reportId));
const mailsAbout = (reportId: string) => server.outbox.to(TO).filter((m) => m.text.includes(reportId));

describe('POST /api/feedback (chunk 19)', () => {
  it('C19-A01 saves the row and the image, and mails FEEDBACK_TO with the words, details, the image and a reply-to', async () => {
    const { jar, email } = await signIn(server);
    const r = report();
    const res = await send(jar, r, png(4096));
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    const [row] = await rowsOf(r.id);
    expect(row).toMatchObject({ id, kind: 'bug', text: r.text, details: DETAILS });
    expect(row!.screenshotKey).toBe(`feedback/${id}/Screenshot.png`);
    expect((server.storage as MemoryStorage).objects.get(row!.screenshotKey!)?.body.byteLength).toBe(4096);
    const [mail] = mailsAbout(r.id);
    expect(mail).toBeDefined();
    expect(mail!.replyTo).toBe(email);
    expect(mail!.subject).toBe('Something’s wrong: The tick did not stick.');
    expect(mail!.text).toContain('It came back after a reload.');
    expect(mail!.text).toContain('App: Tudu on the web 0.38.0 (web)');
    expect(mail!.text).toContain('Page: Today, in a personal space');
    expect(mail!.attachments?.map((a) => [a.filename, a.type, a.content.byteLength])).toEqual([
      ['Screenshot.png', 'image/png', 4096],
    ]);
    // An idea without details or a screenshot says so.
    const idea = report({ kind: 'idea', text: 'Let me snooze a task to a time.', details: null });
    expect((await send(jar, idea)).status).toBe(200);
    const [m2] = mailsAbout(idea.id);
    expect(m2!.subject).toBe('An idea: Let me snooze a task to a time.');
    expect(m2!.text).toContain('No app details: they switched them off.');
    expect(m2!.text).toContain('No screenshot.');
    expect(m2!.attachments).toBeUndefined();
  });

  it('C19-A02 the same report twice is one row and one mail; too long, not an image or too big is 400; signed out is 401', async () => {
    const { jar } = await signIn(server);
    const r = report();
    const a = (await (await send(jar, r, png())).json()) as { id: string };
    const second = await send(jar, r, png());
    expect(second.status).toBe(200);
    expect(((await second.json()) as { id: string }).id).toBe(a.id);
    expect(await rowsOf(r.id)).toHaveLength(1);
    expect(mailsAbout(r.id)).toHaveLength(1);

    const long = await send(jar, report({ text: 'x'.repeat(5001) }));
    expect(long.status).toBe(400);
    expect(((await long.json()) as { error: string }).error).toMatch(/under 5000/);
    const text = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    expect((await send(jar, report(), text)).status).toBe(400);
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'Big.png', { type: 'image/png' });
    expect([400, 413]).toContain((await send(jar, report(), big)).status);
    expect((await send(jar, 'not json')).status).toBe(400);
    expect((await send(jar, { ...report(), details: { ...DETAILS, title: 'Call the venue' } })).status).toBe(
      400,
    );
    expect((await send(null, report())).status).toBe(401);
  });

  it('C19-A03 the eleventh report in an hour is 429; a mail that fails still saves the row and answers 200', async () => {
    const { jar } = await signIn(server);
    server.outbox.failing = true;
    const r = report();
    const res = await send(jar, r);
    expect(res.status).toBe(200);
    expect(await rowsOf(r.id)).toHaveLength(1);
    expect(mailsAbout(r.id)).toHaveLength(0);
    server.outbox.failing = false;
    for (let i = 0; i < 9; i++) expect((await send(jar, report())).status).toBe(200);
    const eleventh = await send(jar, report());
    expect(eleventh.status).toBe(429);
    expect(((await eleventh.json()) as { error: string }).error).toBe(
      'That’s a lot of reports in an hour. Try again a little later.',
    );
    // Someone else is not held up by it.
    const other = await signIn(server);
    expect((await send(other.jar, report())).status).toBe(200);
  });

  it('C19-A04 migration 0011 adds feedback with its columns and the one-report-per-id index', async () => {
    const cols = (
      await server.db.execute(
        sql`select column_name, is_nullable from information_schema.columns where table_name = 'feedback' order by column_name`,
      )
    ).rows.map((r) => `${r.column_name}:${r.is_nullable}`);
    expect(cols).toEqual([
      'created_at:NO',
      'details:YES',
      'id:NO',
      'kind:NO',
      'report_id:NO',
      'screenshot_key:YES',
      'text:NO',
      'user_id:NO',
    ]);
    const idx = await server.db.execute(
      sql`select indexdef from pg_indexes where tablename = 'feedback' and indexname = 'feedback_report'`,
    );
    expect(String(idx.rows[0]!.indexdef)).toMatch(/UNIQUE INDEX .* \(user_id, report_id\)/);
  });
});
