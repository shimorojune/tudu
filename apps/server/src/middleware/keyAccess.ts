import type { Context, MiddlewareHandler } from 'hono';
import { eq, schema, type Db } from '@tudu/db';
import type { KeyAccess } from '../apiKeys';
import type { SessionVars } from './session';

/**
 * What a key may reach. A cookie session is untouched; a key gets only the routes listed here, and only within its
 * level, spaces, Notebook and delete. Account routes (keys, email, photo, members, invites, Jira) are never open to
 * a key: a leaked key can't make more keys or take the account.
 *
 * PROTOTYPE (MCP try-out branch).
 */
type Need = 'space' | 'notebook' | 'all-spaces' | 'any';
const READS: Array<[RegExp, Need]> = [
  [/^\/api\/me$/, 'any'],
  [/^\/api\/access$/, 'any'],
  [/^\/api\/spaces\/[^/]+\/(days|weeks)\/[^/]+$/, 'space'],
  [/^\/api\/spaces\/[^/]+\/(backlog|search|projects|marks|inbox|people)$/, 'space'],
  [/^\/api\/spaces\/[^/]+\/(tasks|people)\/[^/]+$/, 'space'],
  [/^\/api\/search$/, 'any'],
  [/^\/api\/tasks\/ref\/[^/]+$/, 'any'],
  [/^\/api\/inbox$/, 'all-spaces'],
  [/^\/api\/notebook(\/(notes|drawings)\/[^/]+|\/recent|\/trash)?$/, 'notebook'],
  [/^\/api\/tasks\/[^/]+\/notes$/, 'notebook'],
  [/^\/api\/files\/[^/]+$/, 'all-spaces'],
];

const DELETES = new Set([
  'task.delete',
  'subtask.delete',
  'comment.delete',
  'project.delete',
  'note.delete',
  'note.purge',
  'folder.delete',
  'folder.purge',
  'trash.empty',
  'drawing.delete',
  'inbox.delete',
  'inbox.clear',
]);
const NEVER = new Set(['me.rename', 'space.update']);
const isNotebook = (t: string) => /^(note|folder|drawing|trash)\./.test(t);

const no = (c: Context, why: string) => c.json({ error: why }, 403);

export function keyAccess(db: Db): MiddlewareHandler<{ Variables: SessionVars }> {
  return async (c, next) => {
    const a = c.get('access');
    if (!a) return next();
    const path = new URL(c.req.url).pathname;
    const method = c.req.method;

    if (method === 'POST' && path === '/api/sync') {
      if (a.level !== 'write') return no(c, 'This key can only read.');
      const body = (await c.req.json().catch(() => null)) as { mutations?: unknown[] } | null;
      for (const m of body?.mutations ?? []) {
        const why = await refuseMutation(db, a, m);
        if (why) return no(c, why);
      }
      return next();
    }
    if (method !== 'GET') return no(c, 'A key can’t do that. Sign in to Tudu to do it.');
    const hit = READS.find(([re]) => re.test(path));
    if (!hit) return no(c, 'A key can’t do that. Sign in to Tudu to do it.');
    const need = hit[1];
    if (need === 'space') {
      const spaceId = path.split('/')[3]!;
      if (a.spaces && !a.spaces.includes(spaceId)) return no(c, 'This key can’t reach that space.');
    }
    if (need === 'notebook' && !a.notebook) return no(c, 'This key can’t read your Notebook.');
    if (need === 'all-spaces' && a.spaces) return no(c, 'This key reaches only some spaces, so not this.');
    await next();

    // Answers that cross spaces are narrowed to the key's.
    if (c.res.status !== 200) return;
    if (path === '/api/me' && a.spaces) {
      const body = (await c.res.clone().json()) as { spaces?: Array<{ id: string }> };
      body.spaces = body.spaces?.filter((s) => a.spaces!.includes(s.id));
      c.res = Response.json(body, { headers: c.res.headers });
    }
    if (path === '/api/search' && (a.spaces || !a.notebook)) {
      const body = (await c.res.clone().json()) as { hits?: Array<{ spaceId?: string }>; notes?: unknown };
      if (a.spaces) body.hits = body.hits?.filter((h) => h.spaceId && a.spaces!.includes(h.spaceId));
      if (!a.notebook) delete body.notes;
      c.res = Response.json(body, { headers: c.res.headers });
    }
    if (path.startsWith('/api/tasks/ref/') && a.spaces) {
      const body = (await c.res.clone().json()) as { spaceId?: string };
      if (!body.spaceId || !a.spaces.includes(body.spaceId))
        c.res = Response.json({ error: 'No task with that ID.' }, { status: 404 });
    }
  };
}

/** Why a key may not send this change, or null when it may. */
async function refuseMutation(db: Db, a: KeyAccess, raw: unknown): Promise<string | null> {
  const m = raw as { type?: unknown; payload?: Record<string, unknown> } | null;
  const type = typeof m?.type === 'string' ? m.type : '';
  const p = m?.payload ?? {};
  if (NEVER.has(type)) return 'A key can’t change account or space settings.';
  if (DELETES.has(type) && !a.canDelete) return 'This key can’t delete.';
  if (isNotebook(type)) {
    if (!a.notebook) return 'This key can’t change your Notebook.';
    const taskId = type === 'note.create' ? p.linkTo : /^note\.(link|unlink)$/.test(type) ? p.taskId : null;
    if (a.spaces && typeof taskId === 'string' && !(await taskInSpaces(db, taskId, a.spaces)))
      return 'This key can’t reach that space.';
    return null;
  }
  if (!a.spaces) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  let ok: boolean;
  if (type === 'task.create' || type.startsWith('project.')) ok = a.spaces.includes(str(p.spaceId));
  else if (type.startsWith('task.')) ok = await taskInSpaces(db, str(p.id), a.spaces);
  else if (type.startsWith('subtask.') || type.startsWith('comment.'))
    ok = await taskInSpaces(db, str(p.taskId), a.spaces);
  // Requests, the Inbox and All spaces' order cross spaces: only keys for every space send them.
  else ok = false;
  return ok ? null : 'This key can’t reach that space.';
}

async function taskInSpaces(db: Db, taskId: string, spaces: string[]): Promise<boolean> {
  if (!taskId) return false;
  const [row] = await db
    .select({ spaceId: schema.tasks.spaceId })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId));
  return !!row && spaces.includes(row.spaceId);
}
