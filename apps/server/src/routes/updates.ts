import { Hono } from 'hono';
import { DOWNLOAD_NAME, FeedError, type UpdateFeed } from '../updates/feed';

/**
 * The macOS app's update feed, from the track's GitHub release: Tauri's manifest at /updates/latest.json and the
 * bundle at /updates/download/Tudu.app.tar.gz. No session needed; the GitHub token never leaves the server.
 */
export function updateRoutes(feed: UpdateFeed | null) {
  const r = new Hono();
  const fail = (err: unknown) => {
    if (err instanceof FeedError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  };
  r.get('/latest.json', async (c) => {
    if (!feed) return c.json({ error: 'No updates here.' }, 404);
    try {
      return c.json(await feed.manifest(), 200, { 'cache-control': 'no-store' });
    } catch (err) {
      return fail(err);
    }
  });
  r.get('/download/:name', async (c) => {
    if (!feed || c.req.param('name') !== DOWNLOAD_NAME) return c.json({ error: 'Not found.' }, 404);
    try {
      return await feed.download();
    } catch (err) {
      return fail(err);
    }
  });
  return r;
}
