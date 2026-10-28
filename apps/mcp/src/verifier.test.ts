import { describe, expect, it } from 'vitest';
import { OAuthError } from 'skybridge/server';
import { apiVerifier, CHECK_MS } from './verifier';

const who = { user: { id: 'u1', name: 'Asha', email: 'asha@test.tudu' }, access: { kind: 'key', id: 'k1' } };

function fakeApi(status = 200) {
  const calls: string[] = [];
  let answer = status;
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${String(input)} ${new Headers(init?.headers).get('authorization')}`);
    return answer === 200 ? Response.json(who) : Response.json({ error: 'no' }, { status: answer });
  }) as typeof globalThis.fetch;
  return { fetch, calls, set: (s: number) => (answer = s) };
}

describe('MCP verifier', () => {
  it('MCP-U09 asks the API once per 30 s per bearer; a refused bearer is invalid_token', async () => {
    let now = 1_000_000;
    const api = fakeApi();
    const v = apiVerifier({
      apiUrl: 'http://api.test',
      resource: new URL('https://mcp.test/mcp'),
      fetch: api.fetch,
      now: () => now,
    });
    const info = await v.verifyAccessToken('tudu_abc');
    expect(api.calls).toEqual(['http://api.test/api/access Bearer tudu_abc']);
    expect(info).toMatchObject({
      token: 'tudu_abc',
      clientId: 'key:k1',
      resource: new URL('https://mcp.test/mcp'),
      extra: { userId: 'u1' },
    });
    expect(info.expiresAt).toBeGreaterThan(now / 1000);

    now += CHECK_MS - 1;
    await v.verifyAccessToken('tudu_abc');
    expect(api.calls).toHaveLength(1);

    now += 2;
    api.set(401);
    const err = await v.verifyAccessToken('tudu_abc').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OAuthError);
    expect((err as OAuthError).code).toBe('invalid_token');
    expect(api.calls).toHaveLength(2);
  });

  it('a Tudu that can’t be reached is a server error, not a bad token', async () => {
    const v = apiVerifier({
      apiUrl: 'http://api.test',
      resource: new URL('https://mcp.test/mcp'),
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    const err = (await v.verifyAccessToken('tudu_abc').catch((e: unknown) => e)) as OAuthError;
    expect(err.code).toBe('server_error');
  });
});
