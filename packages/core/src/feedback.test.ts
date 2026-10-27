import { describe, expect, it } from 'vitest';
import {
  browserOf,
  feedbackDetails,
  feedbackDetailsLine,
  feedbackDetailsLines,
  feedbackDetailsSchema,
  feedbackRef,
  feedbackReportSchema,
  issueBody,
  issueLabels,
  issueTitle,
  noMentions,
  osOf,
  shotCanBePublic,
} from './feedback';

const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const PIXEL =
  'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

describe('C19-U04 the app details', () => {
  it('C19-U04 version, track, system, page, space kind, window and theme; nothing else', () => {
    const web = feedbackDetails({
      version: '0.38.0',
      userAgent: MAC_CHROME,
      view: 'today',
      spaceKind: 'team',
      width: 1440,
      height: 900,
      theme: 'dark',
    });
    expect(web).toEqual({
      app: 'Tudu on the web',
      version: '0.38.0',
      track: 'web',
      os: 'macOS',
      browser: 'Chrome 141',
      page: 'Today',
      space: 'team',
      window: '1440×900',
      theme: 'dark',
    });
    expect(feedbackDetailsLine(web)).toBe('Tudu 0.38.0 on the web, macOS, the Today page. Never your tasks.');
    expect(feedbackDetailsLine(web, true)).toBe(
      'Tudu 0.38.0 on the web, macOS, the Today page. Shown on the issue. Never your tasks.',
    );

    const mac = feedbackDetails({
      app: { name: 'Tudu Staging', track: 'staging' },
      version: '0.38.0',
      userAgent: MAC_CHROME,
      view: 'backlog',
      spaceKind: 'personal',
      width: 1200.4,
      height: 800,
      theme: 'light',
    });
    expect(mac).toMatchObject({
      app: 'Tudu Staging',
      track: 'staging',
      browser: 'The Mac app',
      page: 'Backlog',
    });
    expect(feedbackDetailsLine(mac)).toBe('Tudu Staging 0.38.0, macOS, the Backlog page. Never your tasks.');
    expect(feedbackDetailsLines(mac)).toEqual([
      'App: Tudu Staging 0.38.0 (staging)',
      'System: macOS, The Mac app',
      'Page: Backlog, in a personal space',
      'Window: 1200×800, light',
    ]);
    // An unknown view still names a page, never the address.
    const odd = feedbackDetails({
      version: '1',
      userAgent: '',
      view: 'ME-12',
      spaceKind: null,
      width: 1,
      height: 1,
      theme: 'light',
    });
    expect(odd).toMatchObject({ page: 'Today', os: 'Unknown', space: null });
  });

  it('C19-U04 reads the system and the browser from the user agent', () => {
    expect(osOf(IPHONE)).toBe('iOS 18.1');
    expect(browserOf(IPHONE)).toBe('Safari 18.1');
    expect(osOf(PIXEL)).toBe('Android 15');
    expect(browserOf(PIXEL)).toBe('Chrome 141');
    expect(osOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/132.0')).toBe('Windows');
    expect(browserOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/132.0')).toBe(
      'Firefox 132',
    );
    expect(browserOf(`${MAC_CHROME} Edg/141.0.0.0`)).toBe('Edge 141');
  });

  it('C19-U04 the schema refuses anything more than the listed details, and words past 5000 characters', () => {
    const d = feedbackDetails({
      version: '0.38.0',
      userAgent: MAC_CHROME,
      view: 'today',
      spaceKind: 'team',
      width: 10,
      height: 10,
      theme: 'light',
    });
    expect(feedbackDetailsSchema.safeParse(d).success).toBe(true);
    expect(feedbackDetailsSchema.safeParse({ ...d, title: 'Call the venue' }).success).toBe(false);
    const id = '6f1c7a3e-1b2c-4d5e-8f90-123456789abc';
    expect(feedbackReportSchema.safeParse({ id, kind: 'bug', text: ' x ', details: null }).data?.text).toBe(
      'x',
    );
    expect(feedbackReportSchema.safeParse({ id, kind: 'bug', text: '   ', details: null }).success).toBe(
      false,
    );
    expect(
      feedbackReportSchema.safeParse({ id, kind: 'bug', text: 'x'.repeat(5001), details: null }).success,
    ).toBe(false);
    expect(feedbackReportSchema.safeParse({ id, kind: 'praise', text: 'x', details: null }).success).toBe(
      false,
    );
  });
});

describe('the public GitHub issue', () => {
  const details = feedbackDetails({
    version: '0.38.0',
    userAgent: MAC_CHROME,
    view: 'week',
    spaceKind: 'team',
    width: 1440,
    height: 900,
    theme: 'dark',
  });

  it('C19-U07 the title is the first line, cut at a word with … past 70 characters', () => {
    expect(issueTitle('  The tick did not stick.\nIt came back.')).toBe('The tick did not stick.');
    const long =
      'Dragging a task from Monday to Tuesday on the week page puts it back on Monday after a second';
    const t = issueTitle(long);
    expect(t.length).toBeLessThanOrEqual(70);
    expect(t).toBe('Dragging a task from Monday to Tuesday on the week page puts it back…');
    expect(issueTitle('x'.repeat(120))).toBe(`${'x'.repeat(69)}…`);
    expect(issueTitle('Two   spaces\tand a tab')).toBe('Two spaces and a tab');
  });

  it('C19-U08 the body: the words, the details lines, the reference; details off says so', () => {
    const body = issueBody({
      kind: 'bug',
      text: 'It broke.\nTwice.',
      details,
      ref: feedbackRef('0f3c2a1b-9d8e-4c7b'),
    });
    expect(body.startsWith('It broke.\nTwice.\n\n---\n')).toBe(true);
    expect(body).toContain('**Something’s wrong**, sent from the Tudu app.');
    for (const line of feedbackDetailsLines(details)) expect(body).toContain(`- ${line}`);
    expect(body).toContain('Filed from the Tudu app · ref 0f3c2a1b');
    const off = issueBody({ kind: 'idea', text: 'Pin tasks', details: null, ref: 'abcd1234' });
    expect(off).toContain('**An idea**');
    expect(off).toContain('_App details were switched off._');
    expect(off).not.toContain('App:');
    // Without a screenshot link the body is exactly as before, and holds no Screenshot section.
    expect(body).not.toContain('Screenshot');
    expect(
      issueBody({
        kind: 'bug',
        text: 'It broke.\nTwice.',
        details,
        ref: feedbackRef('0f3c2a1b-9d8e-4c7b'),
        shot: null,
      }),
    ).toBe(body);
  });

  it('C19-U18 a shown screenshot sits under the words and before the details, as an image', () => {
    const url = 'https://api.tudu.ezdev.net/api/feedback/shots/0f3c2a1b/sig';
    const body = issueBody({ kind: 'bug', text: 'It broke.', details, ref: '0f3c2a1b', shot: url });
    expect(body.startsWith(`It broke.\n\n**Screenshot**\n\n![Screenshot](${url})\n\n---\n`)).toBe(true);
    expect(body.indexOf('![Screenshot]')).toBeLessThan(body.indexOf('- App:'));
  });

  it('C19-U09 @mentions are defused, #refs, emails and links pass; labels by kind', () => {
    expect(noMentions('cc @octocat and @rohit-raj')).toBe('cc @\u200doctocat and @\u200drohit-raj');
    expect(noMentions('@start of line')).toBe('@\u200dstart of line');
    expect(noMentions('mail me@example.com, see #12 and https://x.dev/@a')).toBe(
      'mail me@example.com, see #12 and https://x.dev/@a',
    );
    expect(issueBody({ kind: 'bug', text: 'ping @octocat', details: null, ref: 'r' })).not.toMatch(
      /@octocat/,
    );
    expect(issueLabels('bug')).toEqual(['bug', 'from-app']);
    expect(issueLabels('idea')).toEqual(['enhancement', 'from-app']);
  });
});

describe('the screenshot on the public issue', () => {
  it('C19-U17 a report is private unless it asks (shotPublic defaults to false); only PNG, JPEG, GIF and WebP can go public', () => {
    const base = {
      id: '9b2f7c1e-4a3d-4e5f-8a6b-7c8d9e0f1a2b',
      kind: 'bug',
      text: 'It broke.',
      details: null,
    };
    expect(feedbackReportSchema.parse(base).shotPublic).toBe(false);
    expect(feedbackReportSchema.parse({ ...base, shotPublic: true }).shotPublic).toBe(true);
    expect(feedbackReportSchema.safeParse({ ...base, shotPublic: 'yes' }).success).toBe(false);
    // Only the kinds GitHub shows inline can go on the issue.
    for (const t of ['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
      expect(shotCanBePublic(t)).toBe(true);
    for (const t of ['image/svg+xml', 'image/heic', 'image/tiff', 'image/bmp', 'text/html', 'toString'])
      expect(shotCanBePublic(t)).toBe(false);
  });
});
