import type { McpServer } from 'skybridge/server';
import { z } from 'zod';
import { tuduFor, TuduError, type Access, type TaskRow, type Tudu } from './tudu';

/**
 * Tudu's tools. Each one is a thin call to the API as the caller; the API enforces what the key may do, so a tool
 * never decides access itself. Every tool has a title and says whether it only reads or can delete (the Claude
 * and ChatGPT directories ask for both).
 */
export interface ToolsConfig {
  apiUrl: string;
  /** The day it is for the person when they don't say: their time zone, e.g. "Asia/Kolkata". */
  timeZone: string;
  fetch?: typeof fetch;
}

type Extra = { http?: { authInfo?: { token: string } } };
type Result = { content: string; isError?: boolean };

const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DELETE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A day is YYYY-MM-DD.');
const taskRef = z
  .string()
  .min(1)
  .describe('The task ID people see, like "ME-52" (from any list or search). A task id also works.');
const spaceId = z.string().min(1).describe('A space id from list_spaces.');

export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    now,
  );
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plain text in, the paragraphs Tudu's editor writes out. */
export const htmlOf = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
/** Tudu's HTML out, as plain text the model reads easily. */
export const textOf = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const line = (t: Pick<TaskRow, 'ref' | 'title' | 'done' | 'day' | 'due'> & { spaceId?: string }) =>
  `${t.done ? '[x]' : '[ ]'} ${t.ref ?? '(saving)'} ${t.title}` +
  (t.day ? ` · on ${t.day}` : ' · Backlog') +
  (t.due ? ` · due ${t.due}` : '');
const list = (head: string, tasks: TaskRow[]) =>
  tasks.length ? `${head}\n${tasks.map(line).join('\n')}` : `${head}\nNo tasks.`;

const RE_REF = /^[a-z][a-z0-9]*-\d+$/i;

/** Wraps a handler: the caller's API, and Tudu's refusals as tool errors the model can read and relay. */
function run<A>(cfg: ToolsConfig, fn: (tudu: Tudu, args: A) => Promise<string>) {
  return async (args: A, extra: Extra): Promise<Result> => {
    const token = extra.http?.authInfo?.token;
    if (!token) return { content: 'Not signed in to Tudu.', isError: true };
    try {
      return { content: await fn(tuduFor(cfg.apiUrl, token, cfg.fetch), args) };
    } catch (err) {
      if (err instanceof TuduError) return { content: err.message, isError: true };
      throw err;
    }
  };
}

/** A task by its ref ("ME-52") or id: where it lives and what it is. */
async function findTask(tudu: Tudu, ref: string): Promise<{ spaceId: string; taskId: string; task: TaskDetail }> {
  let at: { spaceId: string; taskId: string };
  if (RE_REF.test(ref.trim())) at = await tudu.get(`/api/tasks/ref/${encodeURIComponent(ref.trim())}`);
  else {
    // An id: look through the spaces this key reaches.
    const hits = await tudu.get<{ hits: Array<{ id: string; spaceId?: string; ref: string }> }>(
      `/api/search?ids=${encodeURIComponent(ref)}`,
    );
    const hit = hits.hits[0];
    if (!hit?.spaceId) throw new TuduError(404, 'No task with that ID.');
    at = { spaceId: hit.spaceId, taskId: hit.id };
  }
  const task = await tudu.get<TaskDetail>(`/api/spaces/${at.spaceId}/tasks/${at.taskId}`);
  return { ...at, task };
}

interface TaskDetail extends TaskRow {
  notes: string;
  subtasks: Array<{ id: string; title: string; done: boolean }>;
  comments: Array<{ id: string; html: string; author: { name: string; email: string }; createdAt: string }>;
  owner: { name: string; email: string } | null;
}

export function registerTools(server: McpServer, cfg: ToolsConfig) {
  const today = (asked?: string) => asked ?? todayIn(cfg.timeZone);
  return server
    .registerTool(
      {
        name: 'whoami',
        title: 'Who am I in Tudu',
        description: 'Who this connection is signed in as, and what it may do (read only or read and write, which spaces, the Notebook, delete).',
        annotations: READ,
      },
      run(cfg, async (tudu) => {
        const a = await tudu.get<Access>('/api/access');
        const x = a.access;
        const can =
          x.kind === 'session'
            ? 'Full access.'
            : [
                `Key "${x.name}": ${x.level === 'read' ? 'read only' : 'read and write'}`,
                x.level === 'write' ? (x.canDelete ? 'can delete' : 'can’t delete') : null,
                x.spaces ? `${x.spaces.length} space(s)` : 'every space',
                x.notebook ? 'Notebook on' : 'no Notebook',
              ]
                .filter(Boolean)
                .join(' · ');
        return `${a.user.name || a.user.email} <${a.user.email}>\n${can}\nToday is ${today()} (${cfg.timeZone}).`;
      }),
    )
    .registerTool(
      {
        name: 'list_spaces',
        title: 'List spaces',
        description: 'The spaces you are in: Personal and team spaces, with their ids and task ID prefixes. Start here.',
        annotations: READ,
      },
      run(cfg, async (tudu) => {
        const me = await tudu.get<{ spaces: Array<{ id: string; kind: string; name: string; prefix: string; role: string; members: number }> }>(
          '/api/me',
        );
        return me.spaces
          .map((s) => `${s.name} (${s.kind}, ${s.prefix}-…, ${s.members} ${s.members === 1 ? 'person' : 'people'}, you are ${s.role}) id=${s.id}`)
          .join('\n');
      }),
    )
    .registerTool(
      {
        name: 'get_day',
        title: 'Read a day',
        description: 'The tasks planned for one day in a space, in order. Defaults to today.',
        inputSchema: { spaceId, day: isoDay.optional().describe('YYYY-MM-DD; today when left out.') },
        annotations: READ,
      },
      run(cfg, async (tudu, a: { spaceId: string; day?: string }) => {
        const day = today(a.day);
        // No `today=` here: reading must not carry unfinished tasks forward, only the app does that.
        const d = await tudu.get<{ tasks: TaskRow[]; counts: { total: number; done: number } }>(
          `/api/spaces/${a.spaceId}/days/${day}`,
        );
        return list(`${day}: ${d.counts.done} of ${d.counts.total} done`, d.tasks);
      }),
    )
    .registerTool(
      {
        name: 'get_week',
        title: 'Read a week',
        description: 'Seven days from a Monday in a space, and its Backlog. Defaults to this week.',
        inputSchema: { spaceId, monday: isoDay.optional().describe('A Monday, YYYY-MM-DD; this week when left out.') },
        annotations: READ,
      },
      run(cfg, async (tudu, a: { spaceId: string; monday?: string }) => {
        const monday = a.monday ?? mondayOf(today());
        const w = await tudu.get<{ days: Array<{ day: string; tasks: TaskRow[] }>; backlog: TaskRow[] }>(
          `/api/spaces/${a.spaceId}/weeks/${monday}`,
        );
        return [...w.days.map((d) => list(d.day, d.tasks)), list('Backlog', w.backlog)].join('\n\n');
      }),
    )
    .registerTool(
      {
        name: 'get_backlog',
        title: 'Read the Backlog',
        description: 'Tasks in a space with no day yet.',
        inputSchema: { spaceId },
        annotations: READ,
      },
      run(cfg, async (tudu, a: { spaceId: string }) => {
        const b = await tudu.get<{ tasks: TaskRow[] }>(`/api/spaces/${a.spaceId}/backlog`);
        return list('Backlog', b.tasks);
      }),
    )
    .registerTool(
      {
        name: 'search_tasks',
        title: 'Search tasks',
        description: 'Find tasks by words in the title or notes, or by task ID. In one space, or every space this connection reaches.',
        inputSchema: { query: z.string().min(1).max(200), spaceId: spaceId.optional() },
        annotations: READ,
      },
      run(cfg, async (tudu, a: { query: string; spaceId?: string }) => {
        const q = encodeURIComponent(a.query);
        const path = a.spaceId
          ? `/api/spaces/${a.spaceId}/search?q=${q}&today=${today()}`
          : `/api/search?q=${q}&today=${today()}`;
        const r = await tudu.get<{
          hits: Array<TaskRow & { snippet: string | null }>;
          notes?: Array<{ id: string; title: string }>;
        }>(path);
        const tasks = r.hits.map((h) => line({ ...h, due: h.due ?? null }) + (h.snippet ? `\n    “${h.snippet}”` : ''));
        const notes = (r.notes ?? []).map((n) => `note ${n.id}: ${n.title || 'Untitled'}`);
        return [tasks.length ? tasks.join('\n') : 'No tasks match.', ...(notes.length ? ['Notes:', ...notes] : [])].join('\n');
      }),
    )
    .registerTool(
      {
        name: 'get_task',
        title: 'Read a task',
        description: 'One task in full: notes, subtasks and comments.',
        inputSchema: { task: taskRef },
        annotations: READ,
      },
      run(cfg, async (tudu, a: { task: string }) => {
        const { task: t } = await findTask(tudu, a.task);
        return [
          line(t),
          t.owner ? `Owner: ${t.owner.name || t.owner.email}` : null,
          t.notes ? `Notes:\n${textOf(t.notes)}` : 'No notes.',
          t.subtasks.length ? `Subtasks:\n${t.subtasks.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`).join('\n')}` : null,
          t.comments.length
            ? `Comments:\n${t.comments.map((c) => `- ${c.author.name || c.author.email} (${c.createdAt.slice(0, 10)}): ${textOf(c.html)}`).join('\n')}`
            : null,
          `id=${t.id} spaceId=${t.spaceId}`,
        ]
          .filter(Boolean)
          .join('\n\n');
      }),
    )
    .registerTool(
      {
        name: 'list_inbox',
        title: 'Read the Inbox',
        description: 'Requests waiting for your answer and updates (comments, answers) across your spaces.',
        annotations: READ,
      },
      run(cfg, async (tudu) => {
        const r = await tudu.get<{
          toAnswer: Array<{ spaceName: string; request?: { title?: string } }>;
          updates: Array<{ kind: string; spaceName: string; readAt: string | null; comment?: { html?: string } }>;
        }>('/api/inbox');
        const asks = r.toAnswer.map((i) => `- To answer (${i.spaceName}): ${i.request?.title ?? 'a request'}`);
        const ups = r.updates
          .slice(0, 20)
          .map((i) => `- ${i.readAt ? '' : '(new) '}${i.kind} in ${i.spaceName}${i.comment?.html ? `: ${textOf(i.comment.html).slice(0, 140)}` : ''}`);
        return [...asks, ...ups].join('\n') || 'Nothing in your Inbox.';
      }),
    )
    .registerTool(
      {
        name: 'list_notes',
        title: 'List Notebook notes',
        description: 'Your Notebook: folders and notes (titles and ids). Only you see your Notebook.',
        annotations: READ,
      },
      run(cfg, async (tudu) => {
        const n = await tudu.get<{
          folders: Array<{ id: string; name: string; parentId: string | null }>;
          notes: Array<{ id: string; title: string; folderId: string | null }>;
        }>('/api/notebook');
        const folder = new Map(n.folders.map((f) => [f.id, f.name]));
        return (
          n.notes.map((x) => `${x.title || 'Untitled'}${x.folderId ? ` (in ${folder.get(x.folderId) ?? 'a folder'})` : ''} id=${x.id}`).join('\n') ||
          'Your Notebook is empty.'
        );
      }),
    )
    .registerTool(
      {
        name: 'get_note',
        title: 'Read a note',
        description: 'One Notebook note as text, with the tasks it is linked to.',
        inputSchema: { noteId: z.string().min(1).describe('A note id from list_notes or search_tasks.') },
        annotations: READ,
      },
      run(cfg, async (tudu, a: { noteId: string }) => {
        const n = await tudu.get<{ title: string; html: string; path: string[]; linked: Array<{ ref: string; title: string }> }>(
          `/api/notebook/notes/${encodeURIComponent(a.noteId)}`,
        );
        return [
          `# ${n.title || 'Untitled'}${n.path.length ? ` (${n.path.join(' / ')})` : ''}`,
          textOf(n.html) || '(empty)',
          n.linked.length ? `Linked tasks: ${n.linked.map((t) => `${t.ref} ${t.title}`).join(', ')}` : null,
        ]
          .filter(Boolean)
          .join('\n\n');
      }),
    )
    .registerTool(
      {
        name: 'create_task',
        title: 'Add a task',
        description: 'Add a task to a day (today when left out) or to the Backlog, at the end of the list.',
        inputSchema: {
          spaceId,
          title: z.string().trim().min(1).max(200),
          day: z.union([isoDay, z.literal('backlog')]).optional().describe('YYYY-MM-DD, or "backlog". Today when left out.'),
          due: isoDay.optional().describe('A deadline, separate from the day it is planned for.'),
          notes: z.string().max(20000).optional().describe('Plain text; blank lines start new paragraphs.'),
        },
        annotations: WRITE,
      },
      run(cfg, async (tudu, a: { spaceId: string; title: string; day?: string; due?: string; notes?: string }) => {
        const out = await tudu.sync([
          {
            type: 'task.create',
            payload: {
              id: crypto.randomUUID(),
              spaceId: a.spaceId,
              title: a.title,
              day: a.day === 'backlog' ? null : today(a.day),
              position: null,
              ...(a.due ? { due: a.due } : {}),
              ...(a.notes ? { notes: htmlOf(a.notes) } : {}),
            },
          },
        ]);
        const t = out.tasks[0];
        return t ? `Added ${line(t)}` : 'Added.';
      }),
    )
    .registerTool(
      {
        name: 'update_task',
        title: 'Change a task',
        description: 'Rename a task, set or clear its due day, or replace its notes. Only what you pass changes.',
        inputSchema: {
          task: taskRef,
          title: z.string().trim().min(1).max(200).optional(),
          due: z.union([isoDay, z.literal('none')]).optional().describe('YYYY-MM-DD, or "none" to clear it.'),
          notes: z.string().max(20000).optional().describe('Replaces the notes. Plain text.'),
        },
        annotations: WRITE,
      },
      run(cfg, async (tudu, a: { task: string; title?: string; due?: string; notes?: string }) => {
        const { taskId } = await findTask(tudu, a.task);
        const m: Array<{ type: string; payload: Record<string, unknown> }> = [];
        if (a.title) m.push({ type: 'task.rename', payload: { id: taskId, title: a.title } });
        if (a.due) m.push({ type: 'task.due', payload: { id: taskId, due: a.due === 'none' ? null : a.due } });
        if (a.notes !== undefined) m.push({ type: 'task.notes', payload: { id: taskId, notes: htmlOf(a.notes) } });
        if (!m.length) return 'Nothing to change.';
        const out = await tudu.sync(m);
        const t = out.tasks.find((x) => x.id === taskId);
        return t ? `Changed ${line(t)}` : 'Changed.';
      }),
    )
    .registerTool(
      {
        name: 'complete_task',
        title: 'Cross off a task',
        description: 'Mark a task done, or not done again with done=false.',
        inputSchema: { task: taskRef, done: z.boolean().default(true) },
        annotations: WRITE,
      },
      run(cfg, async (tudu, a: { task: string; done?: boolean }) => {
        const { taskId } = await findTask(tudu, a.task);
        const out = await tudu.sync([{ type: 'task.cross', payload: { id: taskId, done: a.done ?? true } }]);
        const t = out.tasks.find((x) => x.id === taskId);
        return t ? line(t) : 'Done.';
      }),
    )
    .registerTool(
      {
        name: 'move_task',
        title: 'Move a task',
        description: 'Plan a task for another day, or send it to the Backlog. It goes to the end of that list.',
        inputSchema: { task: taskRef, day: z.union([isoDay, z.literal('backlog')]) },
        annotations: WRITE,
      },
      run(cfg, async (tudu, a: { task: string; day: string }) => {
        const { taskId } = await findTask(tudu, a.task);
        const out = await tudu.sync([
          { type: 'task.place', payload: { id: taskId, day: a.day === 'backlog' ? null : a.day, position: null } },
        ]);
        const t = out.tasks.find((x) => x.id === taskId);
        return t ? `Moved ${line(t)}` : 'Moved.';
      }),
    )
    .registerTool(
      {
        name: 'add_subtask',
        title: 'Add a subtask',
        description: 'Add a step under a task, at the end.',
        inputSchema: { task: taskRef, title: z.string().trim().min(1).max(200) },
        annotations: WRITE,
      },
      run(cfg, async (tudu, a: { task: string; title: string }) => {
        const { taskId, task } = await findTask(tudu, a.task);
        await tudu.sync([
          { type: 'subtask.create', payload: { id: crypto.randomUUID(), taskId, title: a.title, position: null } },
        ]);
        return `Added “${a.title}” under ${task.ref}.`;
      }),
    )
    .registerTool(
      {
        name: 'add_comment',
        title: 'Comment on a task',
        description: 'Add a comment to a task, as you. In a team space the people on it see it.',
        inputSchema: { task: taskRef, text: z.string().trim().min(1).max(5000) },
        annotations: WRITE,
      },
      run(cfg, async (tudu, a: { task: string; text: string }) => {
        const { taskId, task } = await findTask(tudu, a.task);
        await tudu.sync([
          { type: 'comment.create', payload: { id: crypto.randomUUID(), taskId, html: htmlOf(a.text) } },
        ]);
        return `Commented on ${task.ref}.`;
      }),
    )
    .registerTool(
      {
        name: 'create_note',
        title: 'Write a note',
        description: 'A new note in your Notebook, at the top level.',
        inputSchema: {
          title: z.string().trim().max(200),
          text: z.string().max(50000).describe('Plain text; blank lines start new paragraphs.'),
        },
        annotations: WRITE,
      },
      run(cfg, async (tudu, a: { title: string; text: string }) => {
        const id = crypto.randomUUID();
        await tudu.sync([
          { type: 'note.create', payload: { id, folderId: null, title: a.title, html: htmlOf(a.text), position: null } },
        ]);
        return `Wrote “${a.title || 'Untitled'}” id=${id}`;
      }),
    )
    .registerTool(
      {
        name: 'delete_task',
        title: 'Delete a task',
        description: 'Delete a task. People can bring it back with Undo in Tudu for a while, but treat it as gone. Ask first.',
        inputSchema: { task: taskRef },
        annotations: DELETE,
      },
      run(cfg, async (tudu, a: { task: string }) => {
        const { taskId, task } = await findTask(tudu, a.task);
        await tudu.sync([{ type: 'task.delete', payload: { id: taskId } }]);
        return `Deleted ${task.ref} ${task.title}.`;
      }),
    );
}

function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
