import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, schema } from '@tudu/db';
import { SEND_LIMIT } from './app';
import { freshEmail, get, Jar, post, requestCode, signIn, startServer } from '../test/harness';

let server: ReturnType<typeof startServer>;
beforeAll(() => {
  server = startServer();
});
afterAll(async () => {
  await server.close();
});

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe('sign in with a code', () => {
  it('C01-A01 sends a six-digit code to a valid address', async () => {
    const email = freshEmail();
    const { res, code } = await requestCode(server, email);
    expect(res.status).toBe(200);
    const mails = server.outbox.to(email);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toContain('sign-in code');
    expect(code).toMatch(/^\d{6}$/);
  });

  it('C01-A02 refuses an address that is not an email, in plain words', async () => {
    const res = await post(server.app, '/api/auth/email-otp/send-verification-otp', {
      email: 'rohit@northwind',
      type: 'sign-in',
    });
    expect(res.status).toBe(400);
    expect(await body(res)).toEqual({ error: 'That doesn’t look like an email address.' });
    expect(server.outbox.to('rohit@northwind')).toHaveLength(0);
  });

  it('C01-A03 the right code gives a session, the user, and a Personal space for a new person', async () => {
    const email = freshEmail('new');
    const { code } = await requestCode(server, email);
    const jar = new Jar();
    const res = await post(server.app, '/api/auth/sign-in/email-otp', { email, otp: code }, jar);
    expect(res.status).toBe(200);
    expect(jar.size).toBeGreaterThan(0);
    const me = await get(server.app, '/api/me', jar);
    expect(me.status).toBe(200);
    const data = (await me.json()) as {
      user: { email: string };
      spaces: Array<{ kind: string; name: string; role: string }>;
    };
    expect(data.user.email).toBe(email);
    expect(data.spaces).toEqual([
      {
        id: expect.any(String),
        kind: 'personal',
        name: 'Personal',
        color: null,
        role: 'admin',
        slug: 'me',
        prefix: 'ME',
        members: 1,
        inbox: { toAnswer: 0, unread: 0 },
      },
    ]);
  });

  it('C01-A04 a wrong code is refused and counted; the code stays valid', async () => {
    const email = freshEmail();
    const { code } = await requestCode(server, email);
    const wrong = await post(server.app, '/api/auth/sign-in/email-otp', {
      email,
      otp: code === '000000' ? '111111' : '000000',
    });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(((await body(wrong)).code as string) ?? '').toMatch(/INVALID_OTP/);
    const jar = new Jar();
    const right = await post(server.app, '/api/auth/sign-in/email-otp', { email, otp: code }, jar);
    expect(right.status).toBe(200);
  });

  it('C01-A05 five wrong codes lock that code; a new one is needed', async () => {
    const email = freshEmail();
    const { code } = await requestCode(server, email);
    const wrongCode = code === '000000' ? '111111' : '000000';
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await post(server.app, '/api/auth/sign-in/email-otp', { email, otp: wrongCode });
      expect(res.status).toBeGreaterThanOrEqual(400);
      codes.push(((await body(res)).code as string) ?? '');
    }
    expect(codes.slice(0, 4)).toEqual(['INVALID_OTP', 'INVALID_OTP', 'INVALID_OTP', 'INVALID_OTP']);
    expect(codes[4]).toBe('TOO_MANY_ATTEMPTS');
    // the locked code is gone, even when right
    const locked = await post(server.app, '/api/auth/sign-in/email-otp', { email, otp: code });
    expect(locked.status).toBeGreaterThanOrEqual(400);
    // a fresh code works
    const { code: fresh } = await requestCode(server, email);
    const jar = new Jar();
    expect((await post(server.app, '/api/auth/sign-in/email-otp', { email, otp: fresh }, jar)).status).toBe(
      200,
    );
  });

  it('C01-A06 a code older than ten minutes has expired', async () => {
    const email = freshEmail();
    const { code } = await requestCode(server, email);
    // age the stored code by eleven minutes
    const rows = await server.db.select().from(schema.verification);
    const mine = rows.filter((r) => r.identifier.includes(email));
    expect(mine.length).toBeGreaterThan(0);
    for (const r of mine) {
      await server.db
        .update(schema.verification)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(schema.verification.id, r.id));
    }
    const res = await post(server.app, '/api/auth/sign-in/email-otp', { email, otp: code });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(((await body(res)).code as string) ?? '').toMatch(/OTP_EXPIRED|INVALID_OTP/);
  });

  it('C01-A07 a code can be used once', async () => {
    const email = freshEmail();
    const { code } = await requestCode(server, email);
    expect(
      (await post(server.app, '/api/auth/sign-in/email-otp', { email, otp: code }, new Jar())).status,
    ).toBe(200);
    const again = await post(server.app, '/api/auth/sign-in/email-otp', { email, otp: code }, new Jar());
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  it(`C01-A08 more than ${SEND_LIMIT} codes for one address in ten minutes are refused`, async () => {
    const email = freshEmail('busy');
    for (let i = 0; i < SEND_LIMIT; i++) expect((await requestCode(server, email)).res.status).toBe(200);
    const sixth = await requestCode(server, email);
    expect(sixth.res.status).toBe(429);
    expect(await body(sixth.res)).toEqual({
      error: 'Too many codes sent to this address. Wait a few minutes, then try again.',
    });
    expect(server.outbox.to(email)).toHaveLength(SEND_LIMIT);
  });
});

describe('sessions', () => {
  it('C01-A09 GET /api/me needs a session', async () => {
    expect((await get(server.app, '/api/me')).status).toBe(401);
    const { jar, email } = await signIn(server);
    const me = await get(server.app, '/api/me', jar);
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe(email);
  });

  it('C01-A10 sign out ends the session', async () => {
    const { jar } = await signIn(server);
    const out = await post(server.app, '/api/auth/sign-out', {}, jar);
    expect(out.status).toBe(200);
    expect((await get(server.app, '/api/me', jar)).status).toBe(401);
  });

  it('C01-A11 the events stream says hello, keeps a heartbeat, and ends after sign out', async () => {
    const { jar } = await signIn(server);
    const res = await get(server.app, '/api/events', jar, { accept: 'text/event-stream' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !(text.includes('"hello"') && text.includes(': ping'))) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    expect(text).toContain('"type":"hello"');
    expect(text).toContain(': ping');
    // a published event reaches the stream
    const meRes = await get(server.app, '/api/me', jar);
    const userId = ((await meRes.json()) as { user: { id: string } }).user.id;
    server.hub.publish(userId, 'task.changed', { id: 'x' });
    const until = Date.now() + 3000;
    while (Date.now() < until && !text.includes('task.changed')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    expect(text).toContain('"type":"task.changed"');
    // sign out: the stream closes by itself at the next heartbeat
    await post(server.app, '/api/auth/sign-out', {}, jar);
    const end = Date.now() + 3000;
    let closed = false;
    while (Date.now() < end) {
      const { done } = await reader.read();
      if (done) {
        closed = true;
        break;
      }
    }
    expect(closed).toBe(true);
  });
});
