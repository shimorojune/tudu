import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { feedbackDetails, type FeedbackReport } from '@tudu/core';
import { randomUUID as uuid } from 'node:crypto';
import { eq, inArray, schema, sql } from '@tudu/db';
import type { MemoryStorage } from './storage';
import { GITHUB_TEST_HOST, signIn, startServer, type Jar } from '../test/harness';
import { fileReport, ISSUE_MAX_ATTEMPTS, ISSUES_PER_HOUR, sweepIssues } from './feedback/filing';
import { GithubIssues, IssueError } from './feedback/github';
import type { FakeIssue } from './feedback/fake';

const TO = 'reports@tudu.test';
const ISSUES_API = `http://${GITHUB_TEST_HOST}/__test/github-issues`;
let server: ReturnType<typeof startServer>;
/** The same app with no GitHub token: reports are saved and mailed only, as before. */
let plain: ReturnType<typeof startServer>;
beforeAll(() => {
  server = startServer({
    FEEDBACK_TO: TO,
    FEEDBACK_GITHUB_TOKEN: 'test-token',
    FEEDBACK_GITHUB_API: ISSUES_API,
  });
  plain = startServer({ FEEDBACK_TO: TO });
});
afterAll(async () => {
  await server.close();
  await plain.close();
});
beforeEach(() => {
  server.outbox.failing = false;
});

/** Sign in and know your user id too. */
async function signInWithId(on = server): Promise<{ jar: Jar; email: string; userId: string }> {
  const p = await signIn(on);
  const [u] = await on.db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, p.email));
  return { ...p, userId: u!.id };
}

/** What the fake GitHub filed, for issues whose body holds these words. */
async function issuesWith(words: string): Promise<FakeIssue[]> {
  const res = await server.app.request(`/__test/github-issues/issues?has=${encodeURIComponent(words)}`);
  return ((await res.json()) as { issues: FakeIssue[] }).issues;
}
async function githubMode(when: string, mode: 'down' | 'limited' | 'final' | 'up') {
  await server.app.request('/__test/github-issues/mode', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ when, mode }),
  });
}

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

function send(jar: Jar | null, r: unknown, shot?: File, on = server): Promise<Response> {
  const form = new FormData();
  form.set('report', typeof r === 'string' ? r : JSON.stringify(r));
  if (shot) form.set('screenshot', shot);
  return Promise.resolve(
    on.app.request('/api/feedback', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', ...(jar ? { cookie: jar.header() } : {}) },
      body: form,
    }),
  );
}

const rowsOf = (reportId: string) =>
  server.db.select().from(schema.feedback).where(eq(schema.feedback.reportId, reportId));
const mailsAbout = (reportId: string, on = server) =>
  on.outbox.to(TO).filter((m) => m.text.includes(reportId));
type Sent = { id: string; issue: { number: number; url: string } | null; pending: boolean };

describe('POST /api/feedback (chunk 19)', () => {
  it('C19-A01 saves the row and the image, files one issue, and mails FEEDBACK_TO with the words, details, the image, the issue and a reply-to', async () => {
    const { jar, email } = await signIn(server);
    const marker = `A01 ${uuid()}`;
    const r = report({ text: `The tick did not stick.\nIt came back after a reload. ${marker}` });
    const res = await send(jar, r, png(4096));
    expect(res.status).toBe(200);
    const sent = (await res.json()) as Sent;
    const { id } = sent;
    const [issue] = await issuesWith(marker);
    expect(issue).toMatchObject({
      repo: 'shimorojune/tudu',
      title: 'The tick did not stick.',
      labels: ['bug', 'from-app'],
    });
    expect(sent).toEqual({
      id,
      issue: { number: issue!.number, url: `https://github.com/shimorojune/tudu/issues/${issue!.number}` },
      pending: false,
    });
    expect(issue!.body).toContain('App: Tudu on the web 0.38.0 (web)');
    const [row] = await rowsOf(r.id);
    expect(row).toMatchObject({
      id,
      kind: 'bug',
      text: r.text,
      details: DETAILS,
      issueState: 'filed',
      issueNumber: issue!.number,
    });
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
    expect(mail!.text).toContain(`GitHub issue: #${issue!.number} ${sent.issue!.url}`);
    // An idea without details or a screenshot says so.
    const idea = report({ kind: 'idea', text: 'Let me snooze a task to a time.', details: null });
    expect((await send(jar, idea)).status).toBe(200);
    const [m2] = mailsAbout(idea.id);
    expect(m2!.subject).toBe('An idea: Let me snooze a task to a time.');
    expect(m2!.text).toContain('No app details: they switched them off.');
    expect(m2!.text).toContain('No screenshot.');
    expect(m2!.attachments).toBeUndefined();
    const [ideaIssue] = await issuesWith('Let me snooze a task to a time.');
    expect(ideaIssue!.labels).toEqual(['enhancement', 'from-app']);
    expect(ideaIssue!.body).toContain('_App details were switched off._');
  });

  it('C19-A02 the same report twice, even at once, is one row, one mail and one issue; too long, not an image or too big is 400; signed out is 401', async () => {
    const { jar } = await signIn(server);
    const marker = `A02 ${uuid()}`;
    const r = report({ text: `Twice. ${marker}` });
    const a = (await (await send(jar, r, png())).json()) as Sent;
    const second = await send(jar, r, png());
    expect(second.status).toBe(200);
    expect((await second.json()) as Sent).toEqual(a);
    expect(await rowsOf(r.id)).toHaveLength(1);
    expect(mailsAbout(r.id)).toHaveLength(1);
    expect(await issuesWith(marker)).toHaveLength(1);
    // A double click: both at once.
    const both = report({ text: `At once. ${marker}` });
    const [x, y] = await Promise.all([send(jar, both), send(jar, both)]);
    const [bx, by] = [(await x.json()) as Sent, (await y.json()) as Sent];
    expect(bx.id).toBe(by.id);
    expect(await rowsOf(both.id)).toHaveLength(1);
    expect(await issuesWith(`At once. ${marker}`)).toHaveLength(1);

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

  it('C19-A04 migrations 0011 and 0014 give feedback its columns, the issue ones with their defaults, and the one-report-per-id index', async () => {
    const cols = (
      await server.db.execute(
        sql`select column_name, is_nullable from information_schema.columns where table_name = 'feedback' order by column_name`,
      )
    ).rows.map((r) => `${r.column_name}:${r.is_nullable}`);
    expect(cols).toEqual([
      'created_at:NO',
      'details:YES',
      'id:NO',
      'issue_attempts:NO',
      'issue_claimed_at:YES',
      'issue_number:YES',
      'issue_state:NO',
      'issue_url:YES',
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
    const defaults = (
      await server.db.execute(
        sql`select column_name, column_default from information_schema.columns where table_name = 'feedback' and column_name in ('issue_state', 'issue_attempts') order by column_name`,
      )
    ).rows.map((r) => `${r.column_name}=${r.column_default}`);
    expect(defaults).toEqual(['issue_attempts=0', "issue_state='none'::text"]);
  });
});

describe('the public GitHub issue', () => {
  it('C19-A05 GitHub down or rate-limiting: 200 with the issue to come; the row waits; the mail still went', async () => {
    const { jar } = await signIn(server);
    for (const mode of ['down', 'limited'] as const) {
      const marker = `A05 ${mode} ${uuid()}`;
      await githubMode(marker, mode);
      const r = report({ text: `Waits for GitHub. ${marker}` });
      const res = await send(jar, r);
      expect(res.status).toBe(200);
      const sent = (await res.json()) as Sent;
      expect(sent).toEqual({ id: sent.id, issue: null, pending: true });
      const [row] = await rowsOf(r.id);
      expect(row).toMatchObject({ issueState: 'pending', issueAttempts: 1, issueNumber: null });
      const [mail] = mailsAbout(r.id);
      expect(mail!.text).toContain('GitHub issue: waiting for GitHub; it is filed later.');
      expect(await issuesWith(marker)).toHaveLength(0);
      await githubMode(marker, 'up');
    }
  });

  it('C19-A06 the sweep files waiting reports once each, leaves fresh claims, and gives up after the last try', async () => {
    const { jar } = await signIn(server);
    const marker = `A06 ${uuid()}`;
    await githubMode(marker, 'down');
    const r = report({ text: `Sweep me. ${marker}` });
    await send(jar, r);
    await githubMode(marker, 'up');
    const tracker = new GithubIssues({
      token: 't',
      repo: 'shimorojune/tudu',
      api: ISSUES_API,
      fetch: (input, init) =>
        Promise.resolve(server.app.request(String(input).replace(`http://${GITHUB_TEST_HOST}`, ''), init)),
    });
    // Its claim is fresh (the request took it a moment ago): the sweep leaves it.
    await sweepIssues(server.db, tracker, { quiet: true });
    expect(await issuesWith(marker)).toHaveLength(0);
    // Past the claim: filed, once, even with two sweeps at the same time.
    const later = new Date(Date.now() + 5 * 60 * 1000);
    await Promise.all([
      sweepIssues(server.db, tracker, { quiet: true, now: later }),
      sweepIssues(server.db, tracker, { quiet: true, now: later }),
    ]);
    expect(await issuesWith(marker)).toHaveLength(1);
    expect((await rowsOf(r.id))[0]).toMatchObject({ issueState: 'filed', issueAttempts: 2 });
    // A report GitHub keeps refusing for now: the last try marks it failed.
    const stuck = report({ text: `Never gets there. ${marker}` });
    await githubMode(`Never gets there. ${marker}`, 'down');
    await send(jar, stuck);
    const [row] = await rowsOf(stuck.id);
    await server.db
      .update(schema.feedback)
      .set({ issueAttempts: ISSUE_MAX_ATTEMPTS - 1, issueClaimedAt: null })
      .where(eq(schema.feedback.id, row!.id));
    expect((await fileReport(server.db, tracker, row!.id, { quiet: true })).state).toBe('failed');
    expect((await rowsOf(stuck.id))[0]!.issueState).toBe('failed');
    // A failed row is never taken again.
    expect((await fileReport(server.db, tracker, row!.id, { quiet: true })).state).toBe('busy');
  });

  it('C19-A07 a refusal for good (a bad token): failed at once, no retry; the reporter still gets 200 and the mail goes', async () => {
    const { jar } = await signIn(server);
    const marker = `A07 ${uuid()}`;
    await githubMode(marker, 'final');
    const r = report({ text: `Bad token. ${marker}` });
    const res = await send(jar, r);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Sent).pending).toBe(false);
    expect((await rowsOf(r.id))[0]).toMatchObject({ issueState: 'failed', issueAttempts: 1 });
    expect(mailsAbout(r.id)).toHaveLength(1);
    // A timeout is worth retrying; a 404 is not.
    const hang = new GithubIssues({
      token: 't',
      repo: 'a/b',
      api: 'http://x',
      timeoutMs: 20,
      fetch: (_i, init) =>
        new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted')))),
    });
    await expect(hang.file({ title: 't', body: 'b', labels: [] })).rejects.toMatchObject({ retryable: true });
    const gone = new GithubIssues({
      token: 't',
      repo: 'a/b',
      api: 'http://x',
      fetch: () => Promise.resolve(new Response('{}', { status: 404 })),
    });
    await expect(gone.file({ title: 't', body: 'b', labels: [] })).rejects.toBeInstanceOf(IssueError);
    await expect(gone.file({ title: 't', body: 'b', labels: [] })).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('C19-A08 past 30 issues in an hour across everyone, reports wait (saved and mailed); one person is still held to ten (C19-A03)', async () => {
    const { jar } = await signIn(server);
    // Thirty filed in the last hour by others.
    const { userId } = await signInWithId();
    const fakes = Array.from({ length: ISSUES_PER_HOUR }, () => uuid());
    await server.db.insert(schema.feedback).values(
      fakes.map((id) => ({
        id,
        userId,
        reportId: uuid(),
        kind: 'bug' as const,
        text: 'filler',
        issueState: 'filed' as const,
        issueNumber: 1,
        issueUrl: 'u',
        issueClaimedAt: new Date(),
      })),
    );
    try {
      const marker = `A08 ${uuid()}`;
      const r = report({ text: `Over the cap. ${marker}` });
      const sent = (await (await send(jar, r)).json()) as Sent;
      expect(sent.pending).toBe(true);
      expect(await issuesWith(marker)).toHaveLength(0);
      expect((await rowsOf(r.id))[0]!.issueState).toBe('pending');
    } finally {
      await server.db.delete(schema.feedback).where(inArray(schema.feedback.id, fakes));
    }
  });

  it('C19-A09 no token: no issue, nothing to come, state none; Your reports says email', async () => {
    const { jar } = await signIn(plain);
    const r = report();
    const sent = (await (await send(jar, r, undefined, plain)).json()) as Sent;
    expect(sent).toEqual({ id: sent.id, issue: null, pending: false });
    expect((await rowsOf(r.id))[0]!.issueState).toBe('none');
    expect(mailsAbout(r.id, plain)[0]!.text).not.toContain('GitHub issue');
    const mine = await plain.app.request('/api/feedback/mine', { headers: { cookie: jar.header() } });
    expect(((await mine.json()) as { filing: string }).filing).toBe('email');
  });

  it('C19-A10 Your reports: only mine, newest first, twenty at most, with issue and state; signed out is 401', async () => {
    const { jar } = await signIn(server);
    const other = await signIn(server);
    await send(other.jar, report({ text: 'Not yours' }));
    const marker = `A10 ${uuid()}`;
    await githubMode(`Waiting one ${marker}`, 'down');
    const first = report({ text: `Filed one ${marker}\nmore words` });
    await send(jar, first);
    await send(jar, report({ text: `Waiting one ${marker}` }));
    const res = await server.app.request('/api/feedback/mine', { headers: { cookie: jar.header() } });
    const mine = (await res.json()) as {
      filing: string;
      reports: Array<{ title: string; state: string; issue: unknown; kind: string; createdAt: string }>;
    };
    expect(mine.filing).toBe('github');
    expect(mine.reports.map((x) => [x.title, x.state])).toEqual([
      [`Waiting one ${marker}`, 'pending'],
      [`Filed one ${marker}`, 'filed'],
    ]);
    expect(mine.reports[1]!.issue).toMatchObject({
      number: expect.any(Number),
      url: expect.stringContaining('/issues/'),
    });
    expect(mine.reports[0]!.issue).toBeNull();
    // Twenty at most.
    const { userId } = await signInWithId().then(async (p) => {
      await server.db.insert(schema.feedback).values(
        Array.from({ length: 25 }, (_, i) => ({
          id: uuid(),
          userId: p.userId,
          reportId: uuid(),
          kind: 'idea' as const,
          text: `Old ${i}`,
        })),
      );
      const r2 = await server.app.request('/api/feedback/mine', { headers: { cookie: p.jar.header() } });
      expect(((await r2.json()) as { reports: unknown[] }).reports).toHaveLength(20);
      return p;
    });
    expect(userId).toBeTruthy();
    expect((await server.app.request('/api/feedback/mine')).status).toBe(401);
  });

  it('C19-A11 the issue never holds the name, email, user id, a space name or the screenshot', async () => {
    const { jar, email, userId } = await signInWithId();
    const marker = `A11 ${uuid()}`;
    const r = report({ text: `Private check. ${marker}` });
    const { id } = (await (await send(jar, r, png())).json()) as Sent;
    const [issue] = await issuesWith(marker);
    const [row] = await rowsOf(r.id);
    const everything = `${issue!.title}\n${issue!.body}`;
    for (const secret of [email, userId, row!.screenshotKey!, 'Screenshot.png', 'Personal', id, r.id])
      expect(everything).not.toContain(secret);
    expect(issue!.body).toContain(`ref ${id.replace(/-/g, '').slice(0, 8)}`);
  });
});
