import { Hono } from 'hono';

/**
 * A fake GitHub issues API for tests (TEST_ROUTES only). It files what it is sent and numbers issues from 1.
 * `POST /mode` makes reports whose body holds `when` answer as GitHub would when it is `down` (503), rate-limiting
 * (`limited`: 403 with no requests left) or refusing the token (`final`: 401); `up` clears it. Keyed by words, so
 * parallel tests never trip each other. `GET /issues` lists what was filed.
 */
type Mode = 'down' | 'limited' | 'final';

export interface FakeIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  repo: string;
}

export function fakeGithubIssues() {
  const r = new Hono();
  let issues: FakeIssue[] = [];
  let modes = new Map<string, Mode>();

  r.post('/mode', async (c) => {
    const { when, mode } = (await c.req.json()) as { when: string; mode: Mode | 'up' };
    if (mode === 'up') modes.delete(when);
    else modes.set(when, mode);
    return c.json({ ok: true });
  });
  r.post('/reset', (c) => {
    issues = [];
    modes = new Map();
    return c.json({ ok: true });
  });
  r.get('/issues', (c) => {
    const has = c.req.query('has');
    return c.json({ issues: has ? issues.filter((i) => i.body.includes(has)) : issues });
  });
  r.post('/repos/:owner/:repo/issues', async (c) => {
    if (!/^Bearer \S+/.test(c.req.header('authorization') ?? ''))
      return c.json({ message: 'Requires authentication' }, 401);
    const draft = (await c.req.json()) as { title: string; body: string; labels: string[] };
    const mode = [...modes].find(([when]) => draft.body.includes(when))?.[1];
    if (mode === 'down') return c.json({ message: 'Service unavailable' }, 503);
    if (mode === 'limited')
      return c.json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0' });
    if (mode === 'final') return c.json({ message: 'Bad credentials' }, 401);
    const repo = `${c.req.param('owner')}/${c.req.param('repo')}`;
    const issue: FakeIssue = { number: issues.length + 1, repo, ...draft };
    issues.push(issue);
    return c.json(
      { number: issue.number, html_url: `https://github.com/${repo}/issues/${issue.number}` },
      201,
    );
  });
  return r;
}
