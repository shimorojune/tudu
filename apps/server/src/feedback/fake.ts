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
  state?: 'open' | 'closed';
  state_reason?: string | null;
  locked?: boolean;
  /** A pull request: listed by GitHub with the issues, left out by the mirror. */
  pull_request?: boolean;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
}

export interface FakeComment {
  id: number;
  issue: number;
  body: string;
  repo: string;
}

export function fakeGithubIssues() {
  const r = new Hono();
  let issues: FakeIssue[] = [];
  let comments: FakeComment[] = [];
  let modes = new Map<string, Mode>();
  const nextNumber = () => issues.reduce((n, i) => Math.max(n, i.number), 0) + 1;
  const stamp = () => new Date().toISOString();

  r.post('/mode', async (c) => {
    const { when, mode } = (await c.req.json()) as { when: string; mode: Mode | 'up' };
    if (mode === 'up') modes.delete(when);
    else modes.set(when, mode);
    return c.json({ ok: true });
  });
  r.post('/reset', (c) => {
    issues = [];
    comments = [];
    modes = new Map();
    return c.json({ ok: true });
  });
  // Issues for the mirror to read (#76): `{ issues: [{ title, body?, state?, state_reason?, locked?, pull_request? }] }`.
  r.post('/seed', async (c) => {
    const { issues: seed } = (await c.req.json()) as { issues: Array<Partial<FakeIssue> & { title: string }> };
    const out = seed.map((x) => {
      const at = stamp();
      const issue: FakeIssue = {
        labels: [],
        body: '',
        repo: 'shimorojune/tudu',
        state: 'open',
        created_at: at,
        updated_at: at,
        closed_at: x.state === 'closed' ? at : null,
        ...x,
        number: x.number ?? nextNumber(),
      };
      issues = issues.filter((i) => i.number !== issue.number);
      issues.push(issue);
      return issue;
    });
    return c.json({ issues: out });
  });
  r.get('/comments', (c) => {
    const has = c.req.query('has');
    return c.json({ comments: has ? comments.filter((x) => x.body.includes(has)) : comments });
  });
  r.get('/repos/:owner/:repo/issues', (c) => {
    if (!/^Bearer \S+/.test(c.req.header('authorization') ?? ''))
      return c.json({ message: 'Requires authentication' }, 401);
    const since = c.req.query('since');
    const perPage = Math.min(100, Number(c.req.query('per_page') ?? 30));
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const all = issues
      .filter((i) => !since || (i.updated_at ?? '') >= since)
      .sort((a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? '') || a.number - b.number);
    const items = all.slice((page - 1) * perPage, page * perPage).map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body,
      state: i.state ?? 'open',
      state_reason: i.state_reason ?? null,
      locked: !!i.locked,
      html_url: `https://github.com/${i.repo}/issues/${i.number}`,
      created_at: i.created_at ?? stamp(),
      updated_at: i.updated_at ?? stamp(),
      closed_at: i.closed_at ?? null,
      ...(i.pull_request ? { pull_request: { url: 'x' } } : {}),
    }));
    const headers: Record<string, string> = {};
    if (page * perPage < all.length) {
      const next = new URL(c.req.url);
      next.searchParams.set('page', String(page + 1));
      headers.link = `<${next.toString()}>; rel="next"`;
    }
    return c.json(items, 200, headers);
  });
  r.post('/repos/:owner/:repo/issues/:number/comments', async (c) => {
    if (!/^Bearer \S+/.test(c.req.header('authorization') ?? ''))
      return c.json({ message: 'Requires authentication' }, 401);
    const { body } = (await c.req.json()) as { body: string };
    const mode = [...modes].find(([when]) => body.includes(when))?.[1];
    if (mode === 'down') return c.json({ message: 'Service unavailable' }, 503);
    if (mode === 'limited')
      return c.json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0' });
    if (mode === 'final') return c.json({ message: 'Bad credentials' }, 401);
    const number = Number(c.req.param('number'));
    const issue = issues.find((i) => i.number === number && !i.pull_request);
    if (!issue) return c.json({ message: 'Not Found' }, 404);
    if (issue.locked) return c.json({ message: 'Unable to create comment because issue is locked.' }, 403);
    const repo = `${c.req.param('owner')}/${c.req.param('repo')}`;
    const comment: FakeComment = { id: 9000 + comments.length + 1, issue: number, body, repo };
    comments.push(comment);
    return c.json(
      { id: comment.id, html_url: `https://github.com/${repo}/issues/${number}#issuecomment-${comment.id}` },
      201,
    );
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
    const at = stamp();
    const issue: FakeIssue = { number: nextNumber(), repo, state: 'open', created_at: at, updated_at: at, ...draft };
    issues.push(issue);
    return c.json(
      { number: issue.number, html_url: `https://github.com/${repo}/issues/${issue.number}` },
      201,
    );
  });
  return r;
}
