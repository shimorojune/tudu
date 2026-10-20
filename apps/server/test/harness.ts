import { inject } from 'vitest';
import { OutboxMailer } from '../src/email';
import { readEnv } from '../src/env';
import { bootstrap, type Server } from '../src/bootstrap';

/** The app in-process on the run's database, with the outbox mailer, test routes on and a short heartbeat. */
export function startServer(overrides: Partial<NodeJS.ProcessEnv> = {}): Server & { outbox: OutboxMailer } {
  const outbox = new OutboxMailer();
  const env = readEnv({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    AUTH_SECRET: 'test-secret-test-secret-test-secret',
    BASE_URL: 'http://localhost:3456',
    CORS_ORIGINS: 'http://localhost:5173',
    EMAIL_TRANSPORT: 'outbox',
    TEST_ROUTES: '1',
    ...overrides,
  });
  const server = bootstrap(env, { mailer: outbox, heartbeatMs: 50, quiet: true });
  return { ...server, outbox };
}

let n = 0;
/** A fresh address per test so tests never share a person. */
export function freshEmail(tag = 'person'): string {
  n += 1;
  return `${tag}-${Date.now().toString(36)}-${n}@test.tudu`;
}

/** Cookie jar for one signed-in person. */
export class Jar {
  private cookies = new Map<string, string>();
  take(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const [name, ...v] = pair!.split('=');
      const value = v.join('=');
      if (value === '' || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.cookies.delete(name!.trim());
      else this.cookies.set(name!.trim(), value);
    }
  }
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  get size() {
    return this.cookies.size;
  }
}

export async function post(app: Server['app'], path: string, body: unknown, jar?: Jar): Promise<Response> {
  const res = await app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:5173',
      ...(jar ? { cookie: jar.header() } : {}),
    },
    body: JSON.stringify(body),
  });
  jar?.take(res);
  return res;
}

export async function get(
  app: Server['app'],
  path: string,
  jar?: Jar,
  headers: Record<string, string> = {},
): Promise<Response> {
  const res = await app.request(path, {
    headers: { origin: 'http://localhost:5173', ...(jar ? { cookie: jar.header() } : {}), ...headers },
  });
  jar?.take(res);
  return res;
}

/** Ask for a code and read it from the outbox. */
export async function requestCode(
  server: Server & { outbox: OutboxMailer },
  email: string,
): Promise<{ res: Response; code: string | null }> {
  const res = await post(server.app, '/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
  const last = server.outbox.to(email).at(-1);
  return { res, code: last?.text.match(/\b(\d{6})\b/)?.[1] ?? null };
}

/** Sign a fresh person in and return their jar. */
export async function signIn(
  server: Server & { outbox: OutboxMailer },
  email = freshEmail(),
): Promise<{ email: string; jar: Jar }> {
  const { code } = await requestCode(server, email);
  const jar = new Jar();
  const res = await post(server.app, '/api/auth/sign-in/email-otp', { email, otp: code }, jar);
  if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  return { email, jar };
}
