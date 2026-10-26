import { Hono } from 'hono';
import type { NoteListResponse, TrashResponse } from '@tudu/core';
import type { Db } from '@tudu/db';
import { FILE_MAX_BYTES, storeNoteFile } from '../files';
import { requireSession, type SessionVars } from '../middleware/session';
import { notebookTree, notesOfTask, noteRead, recentNotes, trashOf } from '../notebook';
import type { Storage } from '../storage';

/**
 * Your Notebook (chunk 22). Every read is yours alone: someone else's note, folder or task notes answer 404, never
 * 403, so ids can't be probed. Changes go through the sync batch like everything else.
 */
export function notebookRoutes(db: Db, storage: Storage) {
  const r = new Hono<{ Variables: SessionVars }>();

  r.get('/notebook', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    return c.json(await notebookTree(db, userId));
  });

  r.get('/notebook/notes/:id', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const note = await noteRead(db, userId, c.req.param('id'));
    if (!note) return c.json({ error: 'That note isn’t there any more.' }, 404);
    return c.json(note);
  });

  r.get('/notebook/recent', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const limit = Number(c.req.query('limit') ?? 8) || 8;
    const body: NoteListResponse = { notes: await recentNotes(db, userId, limit) };
    return c.json(body);
  });

  r.get('/notebook/trash', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const body: TrashResponse = { items: await trashOf(db, userId) };
    return c.json(body);
  });

  /** Your notes linked to a task: asked apart from the task, so a shared task's own read never carries anyone's notes. */
  r.get('/tasks/:taskId/notes', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const notes = await notesOfTask(db, userId, c.req.param('taskId'));
    if (!notes) return c.json({ error: 'That task isn’t there any more.' }, 404);
    const body: NoteListResponse = { notes };
    return c.json(body);
  });

  /** A file for a note: into your own corner of the bucket, served back to you alone. */
  r.post('/notebook/files', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const length = Number(c.req.header('content-length') ?? 0);
    if (length > FILE_MAX_BYTES + 4096)
      return c.json({ error: 'That file is too big. Files can be up to 25 MB.' }, 413);
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: 'Send the file as form data.' }, 400);
    }
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) return c.json({ error: 'No file came through.' }, 400);
    if (file.size > FILE_MAX_BYTES)
      return c.json({ error: 'That file is too big. Files can be up to 25 MB.' }, 413);
    const saved = await storeNoteFile(db, storage, {
      userId,
      name: file.name,
      type: file.type,
      body: new Uint8Array(await file.arrayBuffer()),
    });
    return c.json(saved, 201);
  });

  return r;
}
