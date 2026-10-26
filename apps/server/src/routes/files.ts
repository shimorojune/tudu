import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { schema, type Db } from '@tudu/db';
import { eq } from '@tudu/db';
import { FILE_MAX_BYTES, attachmentById, storeFile } from '../files';
import { requireSession, type SessionVars } from '../middleware/session';
import type { Storage } from '../storage';
import { roleIn } from '../tasks';

/** Uploads into a space's bucket, and files streamed back to the space's people. */
export function fileRoutes(db: Db, storage: Storage) {
  const r = new Hono<{ Variables: SessionVars }>();

  r.post('/spaces/:spaceId/files', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const { spaceId } = c.req.param();
    if (!(await roleIn(db, userId, spaceId))) return c.json({ error: 'You’re not in that space.' }, 403);
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
    const taskId = typeof form.get('taskId') === 'string' ? String(form.get('taskId')) : null;
    if (taskId) {
      const [t] = await db
        .select({ spaceId: schema.tasks.spaceId })
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId));
      if (!t || t.spaceId !== spaceId) return c.json({ error: 'That task isn’t there any more.' }, 404);
    }
    const body = new Uint8Array(await file.arrayBuffer());
    const saved = await storeFile(db, storage, {
      spaceId,
      taskId,
      name: file.name,
      type: file.type,
      body,
      userId,
    });
    return c.json(saved, 201);
  });

  r.get('/files/:id', requireSession, async (c) => {
    const userId = c.get('session')!.user.id;
    const row = await attachmentById(db, c.req.param('id'));
    if (!row) return c.json({ error: 'No such file.' }, 404);
    // A Notebook file is its owner's alone: to anyone else it isn't there.
    if (row.ownerId) {
      if (row.ownerId !== userId) return c.json({ error: 'No such file.' }, 404);
    } else if (!(await roleIn(db, userId, row.spaceId!)))
      return c.json({ error: 'You’re not in that space.' }, 403);
    const obj = await storage.get(row.key);
    if (!obj) return c.json({ error: 'No such file.' }, 404);
    const inline =
      /^(image\/|application\/pdf|text\/plain)/.test(row.type) && c.req.query('download') !== '1';
    c.header('content-type', row.type);
    c.header('content-length', String(row.size));
    c.header(
      'content-disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    );
    c.header('cache-control', 'private, max-age=3600');
    c.header('x-content-type-options', 'nosniff');
    return stream(c, async (s) => {
      for await (const chunk of obj.body) await s.write(chunk as Uint8Array);
    });
  });

  return r;
}
