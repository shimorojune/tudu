import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { randomUUID } from 'node:crypto';
import { and, count, eq, gt, lt, schema, type Db } from '@tudu/db';
import type { Auth } from './auth';
import type { Env } from './env';
import type { EventHub } from './events';
import { OutboxMailer, type Mailer } from './email';
import { sessionMiddleware, type SessionVars } from './middleware/session';
import { eventRoutes } from './routes/events';
import { fileRoutes } from './routes/files';
import { meRoutes } from './routes/me';
import { inboxRoutes } from './routes/inbox';
import { jiraRoutes } from './routes/jira';
import { fakeJira } from './jira/fake';
import { TokenSeal } from './jira/seal';
import { spaceRoutes } from './routes/spaces';
import { taskRoutes } from './routes/tasks';
import { testRoutes } from './routes/test';
import type { Embeddings } from './closeMatches';
import { updateRoutes } from './routes/updates';
import { fakeGithub } from './updates/fake';
import { UpdateFeed } from './updates/feed';
import type { Storage } from './storage';

export interface AppDeps {
  env: Env;
  db: Db;
  auth: Auth;
  hub: EventHub;
  mailer: Mailer;
  storage: Storage;
  /** How the server reaches Jira; tests route it to the fake Jira in the same process. */
  jiraFetch?: typeof fetch;
  /** How the update feed reaches GitHub; tests route it to the fake GitHub in the same process. */
  githubFetch?: typeof fetch;
  /** Close matches: the vectors and the meaning search (chunk 13). */
  embeddings: Embeddings;
  /** For the live stream heartbeat in tests. */
  heartbeatMs?: number;
  quiet?: boolean;
}

/** At most this many codes to one address in ten minutes. */
export const SEND_LIMIT = 5;
export const SEND_WINDOW_MS = 10 * 60 * 1000;
/** Expired codes are kept a day, so a late try still hears "That code has expired". */
export const STALE_CODE_MS = 24 * 60 * 60 * 1000;

export function createApp(deps: AppDeps) {
  const { env, db, auth, hub, mailer, storage } = deps;
  const app = new Hono<{ Variables: SessionVars }>();
  const origins = env.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!deps.quiet && env.NODE_ENV !== 'test') app.use(logger());
  app.use(
    '*',
    cors({
      origin: (origin) => (origins.includes(origin) ? origin : null),
      credentials: true,
      allowHeaders: ['content-type', 'authorization', 'last-event-id'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );

  app.get('/health', (c) => c.json({ ok: true, at: new Date().toISOString() }));

  // The macOS app's updates, from the track's GitHub release.
  const feed = env.UPDATES_TRACK
    ? new UpdateFeed({
        track: env.UPDATES_TRACK,
        repo: env.UPDATES_GITHUB_REPO,
        token: env.UPDATES_GITHUB_TOKEN,
        api: env.UPDATES_GITHUB_API,
        base: env.BASE_URL,
        fetch: deps.githubFetch,
      })
    : null;
  app.route('/updates', updateRoutes(feed));

  // Sending codes: at most five to one mailbox in ten minutes, whoever asks.
  app.post('/api/auth/email-otp/send-verification-otp', async (c, next) => {
    let email: string | undefined;
    try {
      const body = (await c.req.raw.clone().json()) as { email?: unknown };
      email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
    } catch {
      /* Better Auth answers bad bodies */
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: 'That doesn’t look like an email address.' }, 400);
    }
    const since = new Date(Date.now() - SEND_WINDOW_MS);
    const [row] = await db
      .select({ n: count() })
      .from(schema.otpSends)
      .where(and(eq(schema.otpSends.email, email), gt(schema.otpSends.sentAt, since)));
    if ((row?.n ?? 0) >= SEND_LIMIT) {
      return c.json(
        { error: 'Too many codes sent to this address. Wait a few minutes, then try again.' },
        429,
      );
    }
    await db.insert(schema.otpSends).values({ id: randomUUID(), email });
    // Codes that expired more than a day ago can go (see the auth config: Better Auth's own cleanup is off).
    await db
      .delete(schema.verification)
      .where(lt(schema.verification.expiresAt, new Date(Date.now() - STALE_CODE_MS)));
    await next();
  });

  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  app.use('/api/*', sessionMiddleware(auth));
  app.route('/api', meRoutes(db, hub, mailer, storage));
  app.route('/api', taskRoutes(db, hub, deps.embeddings));
  app.route('/api', spaceRoutes(db, hub, mailer, env.WEB_URL!, storage));
  app.route('/api', inboxRoutes(db));
  app.route('/api', fileRoutes(db, storage));
  app.route(
    '/api',
    jiraRoutes(db, hub, {
      seal: new TokenSeal(env.AUTH_SECRET),
      http: { production: env.NODE_ENV === 'production', fetch: deps.jiraFetch },
    }),
  );
  app.route('/api', eventRoutes(hub, auth, { heartbeatMs: deps.heartbeatMs }));

  if (env.TEST_ROUTES === '1' && mailer instanceof OutboxMailer) {
    app.route('/__test', testRoutes(mailer, db, deps.embeddings));
    app.route('/__test/jira', fakeJira());
    app.route('/__test/github', fakeGithub());
    app.post('/__test/updates/reset', (c) => {
      feed?.reset();
      return c.json({ ok: true });
    });
  }
  // Staging: the same fake Jira, reachable as https://api.staging…/demo-jira, for reviewing without a real one.
  if (env.DEMO_JIRA === '1') app.route('/demo-jira', fakeJira());

  app.notFound((c) => c.json({ error: 'Not found.' }, 404));
  app.onError((err, c) => {
    if (!deps.quiet) console.error(err);
    return c.json({ error: 'Something went wrong on the server.' }, 500);
  });
  return app;
}

export type App = ReturnType<typeof createApp>;
