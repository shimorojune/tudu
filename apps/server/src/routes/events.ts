import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { requireSession, type SessionVars } from '../middleware/session';
import type { EventHub } from '../events';
import type { Auth } from '../auth';

export const HEARTBEAT_MS = 25_000;

/** GET /events: the live stream for the signed-in person. */
/** The stream ends by itself once the session is gone (signed out elsewhere), checked at every heartbeat. */
export function eventRoutes(hub: EventHub, auth: Auth, options: { heartbeatMs?: number } = {}) {
  const r = new Hono<{ Variables: SessionVars }>();
  const heartbeat = options.heartbeatMs ?? HEARTBEAT_MS;
  r.get('/events', requireSession, (c) => {
    const userId = c.get('session')!.user.id;
    const headers = c.req.raw.headers;
    // A reconnect names the last event it saw and gets what it missed. A fresh stream starts now: replaying old
    // events to a page that just loaded would act on news it already read (a space.gone from before an Undo).
    const given = c.req.header('last-event-id') ?? c.req.query('lastEventId');
    const after = given === undefined ? Infinity : Number(given) || 0;
    return streamSSE(c, async (stream) => {
      let open = true;
      const send = (e: { id: number; type: string; data: unknown }) =>
        stream.writeSSE({
          id: String(e.id),
          event: 'message',
          data: JSON.stringify({ type: e.type, data: e.data }),
        });
      for (const e of hub.since(userId, after)) await send(e);
      await stream.writeSSE({
        event: 'message',
        data: JSON.stringify({ type: 'hello', data: { at: new Date().toISOString() } }),
      });
      const unsubscribe = hub.subscribe(userId, (e) => {
        void send(e);
      });
      const timer = setInterval(() => {
        if (!open) return;
        void stream.write(': ping\n\n');
        void auth.api.getSession({ headers }).then((s) => {
          if (!s && open) {
            open = false;
            void stream.close();
          }
        });
      }, heartbeat);
      stream.onAbort(() => {
        open = false;
        clearInterval(timer);
        unsubscribe();
      });
      while (open) await stream.sleep(1000);
    });
  });
  return r;
}
