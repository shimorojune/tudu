import { describe, expect, it } from 'vitest';
import {
  browserOf,
  feedbackDetails,
  feedbackDetailsLine,
  feedbackDetailsLines,
  feedbackDetailsSchema,
  feedbackReportSchema,
  osOf,
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
