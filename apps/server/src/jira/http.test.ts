import { describe, expect, it } from 'vitest';
import { checkSite, isPrivateAddress } from './guard';
import { JiraFailure, JiraHttp, cleanJiraHtml, jiraInstant } from './http';
import { TokenSeal } from './seal';

const SITE = 'https://jira.northwind.io';

/** A fetch that answers with whatever the test gives, and records what was asked. */
function stub(answer: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const asked: Array<{ url: string; auth: string | null }> = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    asked.push({ url, auth: new Headers(init?.headers).get('authorization') });
    return answer(url, init);
  }) as typeof fetch;
  return { f, asked };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const publicDns = async () => ['104.192.141.1'];

async function failure(p: Promise<unknown>): Promise<JiraFailure> {
  try {
    await p;
  } catch (err) {
    if (err instanceof JiraFailure) return err;
    throw err;
  }
  throw new Error('expected a JiraFailure');
}

describe('the Jira client (chunk 10)', () => {
  it('C10-U10 refusals, mapping, cleaning and the address guard', async () => {
    // A token Jira refuses: under the token field. The token goes as a Bearer and nowhere else.
    const refused = stub(() => json({ message: 'no' }, 401));
    const h = new JiraHttp(SITE, 'tok-secret', { fetch: refused.f, production: true, resolve: publicDns });
    const e1 = await failure(h.myself());
    expect(e1).toMatchObject({ code: 'token-refused', field: 'token' });
    expect(e1.message).not.toContain('tok-secret');
    expect(refused.asked[0]).toEqual({ url: `${SITE}/rest/api/2/myself`, auth: 'Bearer tok-secret' });

    // An address that can't be reached, a 5xx, a redirect, and an answer that is not Jira.
    const dead = stub(() => Promise.reject(new TypeError('fetch failed')));
    expect(
      await failure(new JiraHttp(SITE, 't', { fetch: dead.f, production: false }).myself()),
    ).toMatchObject({ code: 'unreachable', field: 'site', status: 502 });
    const busy = stub(() => new Response('nope', { status: 503 }));
    expect(
      await failure(new JiraHttp(SITE, 't', { fetch: busy.f, production: false }).search('x', 5)),
    ).toMatchObject({ code: 'unreachable' });
    const moved = stub(() => new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/' } }));
    expect(
      await failure(new JiraHttp(SITE, 't', { fetch: moved.f, production: false }).myself()),
    ).toMatchObject({ code: 'unreachable' });
    const html = stub(() => new Response('<html>hello</html>', { status: 200 }));
    expect(
      await failure(new JiraHttp(SITE, 't', { fetch: html.f, production: false }).myself()),
    ).toMatchObject({ code: 'unreachable', field: 'site' });

    // A token that can't read issues; Jira's own words for a JQL; an expired token; a timeout.
    const noRead = stub(() => json({ errorMessages: ['no'] }, 403));
    expect(
      await failure(new JiraHttp(SITE, 't', { fetch: noRead.f, production: false }).search('x', 5)),
    ).toMatchObject({ code: 'no-read' });
    const jql = stub(() =>
      json(
        { errorMessages: ["Field 'stauts' does not exist or you do not have permission to view it."] },
        400,
      ),
    );
    expect(
      await failure(new JiraHttp(SITE, 't', { fetch: jql.f, production: false }).search('stauts = x', 5)),
    ).toMatchObject({
      code: 'jql',
      message: "Field 'stauts' does not exist or you do not have permission to view it.",
    });
    const exp = stub(() => json({}, 401));
    expect(
      await failure(new JiraHttp(SITE, 't', { fetch: exp.f, production: false }).search('x', 5)),
    ).toMatchObject({ code: 'expired', status: 401 });
    const slow = stub(
      (_u, init) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    expect(
      await failure(new JiraHttp(SITE, 't', { fetch: slow.f, production: false, timeoutMs: 20 }).myself()),
    ).toMatchObject({ code: 'unreachable' });

    // Issues and the preview mapped from Jira's answers; the rendered HTML cleaned, its links made whole.
    const ok = stub((url) =>
      url.includes('/search')
        ? json({
            total: 9,
            issues: [
              {
                key: 'TUDU-1',
                fields: {
                  summary: 'One',
                  status: { name: 'To do' },
                  duedate: '2026-10-22',
                  updated: '2026-10-17T10:12:00.000+0530',
                },
              },
            ],
          })
        : json({
            key: 'TUDU-1',
            fields: {
              summary: 'One',
              status: { name: 'To do' },
              issuetype: { name: 'Bug' },
              assignee: { displayName: 'Asha Rao' },
              priority: { name: 'High' },
              comment: {
                total: 1,
                comments: [
                  {
                    id: '9',
                    author: { displayName: 'Meera' },
                    created: '2026-10-17T10:12:00.000+0000',
                    body: 'raw',
                  },
                ],
              },
            },
            renderedFields: {
              description:
                '<p>See <a href="/browse/TUDU-2">TUDU-2</a></p><script>alert(1)</script><img src=x onerror=alert(1)>',
              comment: { comments: [{ id: '9', body: '<p>Looks <b>good</b></p>' }] },
            },
          }),
    );
    const j = new JiraHttp(SITE, 't', { fetch: ok.f, production: false });
    const list = await j.search('x', 5);
    expect(list).toEqual({
      total: 9,
      issues: [
        {
          key: 'TUDU-1',
          summary: 'One',
          status: 'To do',
          due: '2026-10-22',
          updated: '2026-10-17T04:42:00.000Z',
        },
      ],
    });
    const d = await j.issue('TUDU-1');
    expect(d).toMatchObject({ issuetype: 'Bug', assignee: 'Asha Rao', priority: 'High', commentTotal: 1 });
    expect(d.description).toBe(
      `<p>See <a href="${SITE}/browse/TUDU-2" rel="noopener noreferrer" target="_blank">TUDU-2</a></p>`,
    );
    expect(d.comments).toEqual([
      { id: '9', who: 'Meera', at: '2026-10-17T10:12:00.000Z', html: '<p>Looks <b>good</b></p>' },
    ]);
    expect(cleanJiraHtml('<p></p>', SITE)).toBe('');
    expect(jiraInstant('nonsense')).toBeNull();

    // In production: only https, and never a private or loopback address; no request is sent.
    const never = stub(() => json({}));
    const http = await failure(
      new JiraHttp('http://jira.northwind.io', 't', {
        fetch: never.f,
        production: true,
        resolve: publicDns,
      }).myself(),
    );
    expect(http).toMatchObject({ code: 'not-address', field: 'site' });
    const inside = await failure(
      new JiraHttp(SITE, 't', {
        fetch: never.f,
        production: true,
        resolve: async () => ['10.1.2.3'],
      }).myself(),
    );
    expect(inside).toMatchObject({
      code: 'private-address',
      message: 'Couldn’t reach Jira at this address.',
    });
    expect(never.asked).toHaveLength(0);
    expect(await checkSite('https://localhost:8443', true)).toEqual({ ok: false, why: 'private' });
    expect(await checkSite('https://127.0.0.1', true)).toEqual({ ok: false, why: 'private' });
    expect(await checkSite('http://localhost:3456', false)).toEqual({ ok: true });
    for (const ip of [
      '10.0.0.1',
      '172.16.4.4',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '::1',
      'fd00::1',
      '::ffff:127.0.0.1',
    ])
      expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ['104.192.141.1', '8.8.8.8', '2606:4700::1']) expect(isPrivateAddress(ip)).toBe(false);

    // The token at rest: sealed, opened, and unreadable with another secret.
    const seal = new TokenSeal('test-secret-test-secret-test-secret');
    const sealed = seal.seal('my-pat');
    expect(sealed).not.toContain('my-pat');
    expect(seal.open(sealed)).toBe('my-pat');
    expect(new TokenSeal('another-secret-another-secret').open(sealed)).toBeNull();
    expect(seal.open(`${sealed.slice(0, -2)}AA`)).toBeNull();
  });
});
