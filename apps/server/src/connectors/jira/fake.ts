import { Hono } from 'hono';
import { stripTags } from '@tudu/core';

/**
 * A small Jira Data Center for tests, mounted at /__test/jira when TEST_ROUTES=1. It answers the three endpoints
 * Tudu reads (myself, search, issue) with a fixed set of issues, reads a little JQL, and keeps Jira's own
 * refusals. Tokens say what they are: `good-…` reads, `noread-…` is a token that can't read issues, anything else
 * is refused. POST /expire makes a token stop working; POST /down makes Jira answer 503 for it.
 */
interface FakeIssue {
  key: string;
  summary: string;
  type: string;
  status: string;
  priority: string;
  due: string | null;
  updated: string;
  mine: boolean;
  resolved: boolean;
  description: string;
  comments: Array<{ who: string; at: string; html: string }>;
}

const ME = { name: 'asha', displayName: 'Asha Rao', emailAddress: 'asha@northwind.io' };

const c = (who: string, at: string, words: string) => ({ who, at, html: `<p>${words}</p>` });

export const FAKE_ISSUES: FakeIssue[] = [
  {
    key: 'TUDU-212',
    summary: 'Make the Jira panel remember the last view',
    type: 'Story',
    status: 'In progress',
    priority: 'High',
    due: '2026-10-22',
    updated: '2026-10-18T08:40:00.000+0000',
    mine: true,
    resolved: false,
    description:
      '<p>When you close the panel and open it again, it should come back on the view you left.</p><ul><li>Per browser</li><li>Per space</li></ul>',
    comments: [
      c('Meera Iyer', '2026-10-12T09:00:00.000+0000', 'Is this per space or per browser?'),
      c('Asha Rao', '2026-10-12T10:00:00.000+0000', 'Both, I think.'),
      c('Meera Iyer', '2026-10-13T09:00:00.000+0000', 'Fine by me.'),
      c('Arjun Mehta', '2026-10-15T09:00:00.000+0000', 'Design is on the canvas.'),
      c('Meera Iyer', '2026-10-17T09:00:00.000+0000', 'Ready for review when you are.'),
    ],
  },
  {
    key: 'TUDU-219',
    summary: 'Fix the date picker on Safari',
    type: 'Bug',
    status: 'To do',
    priority: 'Highest',
    due: '2026-10-16',
    updated: '2026-10-17T16:10:00.000+0000',
    mine: true,
    resolved: false,
    description: '<p>The month arrows do nothing in Safari 19.</p>',
    comments: [c('Arjun Mehta', '2026-10-16T11:00:00.000+0000', 'Seen on 19.1 too.')],
  },
  {
    key: 'TUDU-220',
    summary: 'Run the request status enum migration on production',
    type: 'Task',
    status: 'In review',
    priority: 'Medium',
    due: null,
    updated: '2026-10-17T11:00:00.000+0000',
    mine: true,
    resolved: false,
    description: '',
    comments: [],
  },
  {
    key: 'TUDU-224',
    summary: 'Write the release notes for 0.38',
    type: 'Task',
    status: 'To do',
    priority: 'Medium',
    due: '2026-10-18',
    updated: '2026-10-16T15:00:00.000+0000',
    mine: true,
    resolved: false,
    description: '<p>Short, in plain words.</p>',
    comments: [],
  },
  {
    key: 'OPS-14',
    summary: 'Rotate the staging database password',
    type: 'Task',
    status: 'To do',
    priority: 'High',
    due: '2026-10-20',
    updated: '2026-10-15T09:30:00.000+0000',
    mine: true,
    resolved: false,
    description: '<p>Every quarter.</p>',
    comments: [],
  },
  {
    key: 'TUDU-226',
    summary: 'Tidy the staging buckets',
    type: 'Task',
    status: 'Backlog',
    priority: 'Low',
    due: null,
    updated: '2026-10-14T09:30:00.000+0000',
    mine: true,
    resolved: false,
    description: '',
    comments: [],
  },
  {
    key: 'TUDU-231',
    summary: 'Add keyboard help to the week view',
    type: 'Story',
    status: 'To do',
    priority: 'Low',
    due: '2026-11-04',
    updated: '2026-10-13T09:30:00.000+0000',
    mine: true,
    resolved: false,
    description: '',
    comments: [],
  },
  {
    key: 'TUDU-198',
    summary: 'Clean up the old feature flags',
    type: 'Task',
    status: 'Done',
    priority: 'Low',
    due: null,
    updated: '2026-10-10T09:30:00.000+0000',
    mine: true,
    resolved: true,
    description: '',
    comments: [],
  },
  {
    key: 'TUDU-240',
    summary: 'Review the onboarding copy',
    type: 'Bug',
    status: 'To do',
    priority: 'Medium',
    due: null,
    updated: '2026-10-12T09:30:00.000+0000',
    mine: false,
    resolved: false,
    description: '',
    comments: [],
  },
];

type Filter = (i: FakeIssue) => boolean;
class JqlError extends Error {}

const FIELDS = new Set([
  'assignee',
  'resolution',
  'issuetype',
  'type',
  'project',
  'text',
  'summary',
  'key',
  'issuekey',
  'status',
]);
const SORTS = new Set(['updated', 'duedate', 'key', 'priority', 'created']);

function unquote(v: string): string {
  const t = v.trim();
  return /^".*"$|^'.*'$/.test(t) ? t.slice(1, -1) : t;
}

/** Enough JQL for the tests: clauses joined by AND, =, != and ~, and ORDER BY. */
export function readJql(jql: string): { filter: Filter; sort: (a: FakeIssue, b: FakeIssue) => number } {
  const quotes = jql.match(/"/g)?.length ?? 0;
  if (quotes % 2) {
    const from = jql.slice(jql.lastIndexOf('"'));
    throw new JqlError(
      `Error in the JQL Query: The quoted string '${from.slice(1)}' has not been completed.`,
    );
  }
  const [where = '', order] = jql.split(/\s+ORDER\s+BY\s+/i);
  let sort = (a: FakeIssue, b: FakeIssue) => b.updated.localeCompare(a.updated);
  if (order) {
    const [field = '', dir = 'ASC'] = order.trim().split(/\s+/);
    if (!SORTS.has(field.toLowerCase())) throw new JqlError(`Not able to sort using field '${field}'.`);
    const f = field.toLowerCase();
    const key = (i: FakeIssue) => (f === 'duedate' ? (i.due ?? '9999') : f === 'key' ? i.key : i.updated);
    const sign = dir.toUpperCase() === 'DESC' ? -1 : 1;
    sort = (a, b) => sign * key(a).localeCompare(key(b));
  }
  const filters: Filter[] = [];
  for (const raw of where.trim() ? where.split(/\s+AND\s+/i) : []) {
    const m = /^\s*([A-Za-z]+)\s*(!=|=|~)\s*(.+?)\s*$/.exec(raw);
    if (!m) throw new JqlError(`Error in the JQL Query: Expecting an operator but got '${raw.trim()}'.`);
    const field = m[1]!.toLowerCase();
    const op = m[2]!;
    const value = unquote(m[3]!);
    if (!FIELDS.has(field))
      throw new JqlError(`Field '${m[1]}' does not exist or you do not have permission to view it.`);
    const lv = value.toLowerCase();
    let f: Filter;
    switch (field) {
      case 'assignee':
        f = lv === 'currentuser()' ? (i) => i.mine : (i) => (i.mine ? ME.name === lv : false);
        break;
      case 'resolution':
        f = lv === 'unresolved' ? (i) => !i.resolved : (i) => i.resolved;
        break;
      case 'issuetype':
      case 'type':
        f = (i) => i.type.toLowerCase() === lv;
        break;
      case 'project':
        f = (i) => i.key.split('-')[0]!.toLowerCase() === lv;
        break;
      case 'status':
        f = (i) => i.status.toLowerCase() === lv;
        break;
      case 'key':
      case 'issuekey':
        f = (i) => i.key.toLowerCase() === lv;
        break;
      default: {
        const words = lv.replace(/\*/g, '').split(/\s+/).filter(Boolean);
        f = (i) => {
          const hay = `${i.summary} ${field === 'text' ? stripTags(i.description, ' ') : ''}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        };
      }
    }
    filters.push(op === '!=' ? (i) => !f(i) : f);
  }
  return { filter: (i) => filters.every((f) => f(i)), sort };
}

function rawIssue(i: FakeIssue, detail: boolean) {
  const fields: Record<string, unknown> = {
    summary: i.summary,
    status: { name: i.status },
    duedate: i.due,
    updated: i.updated,
  };
  if (!detail) return { key: i.key, fields };
  const comments = i.comments.map((x, n) => ({
    id: `${i.key}-c${n + 1}`,
    author: { displayName: x.who },
    created: x.at,
    body: stripTags(x.html),
  }));
  return {
    key: i.key,
    fields: {
      ...fields,
      issuetype: { name: i.type },
      assignee: i.mine
        ? { displayName: ME.displayName, name: ME.name }
        : { displayName: 'Meera Iyer', name: 'meera' },
      priority: { name: i.priority },
      description: stripTags(i.description),
      comment: { total: comments.length, comments },
    },
    renderedFields: {
      description: i.description || null,
      comment: { comments: comments.map((x, n) => ({ id: x.id, body: i.comments[n]!.html })) },
    },
  };
}

export function fakeJira() {
  const expired = new Set<string>();
  const down = new Set<string>();
  const r = new Hono();

  const who = (h: string | undefined) => /^Bearer\s+(.+)$/i.exec(h ?? '')?.[1]?.trim() ?? '';
  // The token's answer before anything else: refused, expired, down, or which kind it is.
  r.use('/rest/*', async (c, next) => {
    const t = who(c.req.header('authorization'));
    if (down.has(t)) return c.text('Service Unavailable', 503);
    if (expired.has(t) || !(t.startsWith('good-') || t.startsWith('noread-')))
      return c.json({ message: 'Client must be authenticated to access this resource.' }, 401);
    await next();
  });

  r.get('/rest/api/2/myself', (c) => c.json({ ...ME, key: ME.name, active: true }));

  r.get('/rest/api/2/search', (c) => {
    if (who(c.req.header('authorization')).startsWith('noread-'))
      return c.json({ errorMessages: ['You do not have the permission to see the specified issues.'] }, 403);
    let q;
    try {
      q = readJql(c.req.query('jql') ?? '');
    } catch (err) {
      return c.json({ errorMessages: [(err as Error).message], errors: {} }, 400);
    }
    const max = Math.min(Number(c.req.query('maxResults') ?? 50) || 50, 100);
    const all = FAKE_ISSUES.filter(q.filter).sort(q.sort);
    return c.json({
      startAt: 0,
      maxResults: max,
      total: all.length,
      issues: all.slice(0, max).map((i) => rawIssue(i, false)),
    });
  });

  r.get('/rest/api/2/issue/:key', (c) => {
    if (who(c.req.header('authorization')).startsWith('noread-'))
      return c.json({ errorMessages: ['You do not have the permission to see the specified issue.'] }, 403);
    const i = FAKE_ISSUES.find((x) => x.key === c.req.param('key').toUpperCase());
    if (!i) return c.json({ errorMessages: ['Issue Does Not Exist'], errors: {} }, 404);
    return c.json(rawIssue(i, true));
  });

  r.get('/browse/:key', (c) =>
    c.html(`<!doctype html><title>${c.req.param('key')}</title><h1>${c.req.param('key')}</h1>`),
  );

  r.post('/expire', async (c) => {
    const { token } = (await c.req.json()) as { token?: string };
    if (token) expired.add(token);
    return c.body(null, 204);
  });
  r.post('/down', async (c) => {
    const { token, down: on = true } = (await c.req.json()) as { token?: string; down?: boolean };
    if (token) {
      if (on) down.add(token);
      else down.delete(token);
    }
    return c.body(null, 204);
  });
  return r;
}
