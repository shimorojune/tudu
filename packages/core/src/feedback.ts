import { z } from 'zod';

/** A report's words may run this long. */
export const FEEDBACK_TEXT_MAX = 5000;
/** One screenshot, an image, up to this big. */
export const FEEDBACK_IMAGE_MAX = 10 * 1024 * 1024;
/** Reports one person may send in an hour. */
export const FEEDBACK_PER_HOUR = 10;

export const feedbackKindSchema = z.enum(['bug', 'idea']);
export type FeedbackKind = z.infer<typeof feedbackKindSchema>;

const short = z.string().max(80);

/**
 * What "Include app details" sends: the app and its version, the system, the page and the kind of space, the window
 * and the theme. Strict, so nothing else (a title, a note, a name) can ride along.
 */
export const feedbackDetailsSchema = z
  .object({
    app: short,
    version: short,
    track: z.enum(['production', 'staging', 'test', 'web']),
    os: short,
    browser: short,
    page: short,
    space: z.enum(['personal', 'team']).nullable(),
    window: short,
    theme: z.enum(['light', 'dark']),
  })
  .strict();
export type FeedbackDetails = z.infer<typeof feedbackDetailsSchema>;

/** The report as the client sends it next to the image. `id` is the client's, so a retry is one report. */
export const feedbackReportSchema = z.object({
  id: z.string().uuid(),
  kind: feedbackKindSchema,
  text: z
    .string()
    .trim()
    .min(1, 'Say what happened first.')
    .max(FEEDBACK_TEXT_MAX, 'That is too long. Keep it under 5000 characters.'),
  details: feedbackDetailsSchema.nullable(),
});
export type FeedbackReport = z.infer<typeof feedbackReportSchema>;

const PAGES: Record<string, string> = {
  today: 'Today',
  week: 'Week',
  backlog: 'Backlog',
  inbox: 'Inbox',
  people: 'People',
  jira: 'Jira',
  apps: 'Apps',
  settings: 'Settings',
  more: 'More',
  menubar: 'Menu bar',
};

/** "macOS", "Windows", "iOS 18.1", "Android 15", "Linux". The browser freezes macOS's own version, so none there. */
export function osOf(ua: string): string {
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/.exec(ua);
  if (ios) return `iOS ${ios[1]}.${ios[2]}`;
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

/** "Chrome 141", "Safari 18.1", "Firefox 132", "Edge 141". */
export function browserOf(ua: string): string {
  const pick = (re: RegExp, name: string) => {
    const m = re.exec(ua);
    return m ? `${name} ${m[1]}` : null;
  };
  return (
    pick(/Edg\/(\d+)/, 'Edge') ??
    pick(/Firefox\/(\d+)/, 'Firefox') ??
    pick(/(?:Chrome|CriOS)\/(\d+)/, 'Chrome') ??
    pick(/Version\/(\d+(?:\.\d+)?).*Safari/, 'Safari') ??
    'Unknown'
  );
}

export interface FeedbackDetailsInput {
  /** The app's name and track in the Mac app; the web has neither. */
  app?: { name: string; track: 'production' | 'staging' | 'test' };
  version: string;
  userAgent: string;
  /** The view the page is on ("today"), never its address: that can hold a task's id. */
  view: string;
  spaceKind: 'personal' | 'team' | null;
  width: number;
  height: number;
  theme: 'light' | 'dark';
}

/** The details, built only from what is listed: whatever the page shows, no task, note, person or space name goes. */
export function feedbackDetails(x: FeedbackDetailsInput): FeedbackDetails {
  const inApp = !!x.app;
  return {
    app: x.app ? x.app.name : 'Tudu on the web',
    version: x.version,
    track: x.app ? x.app.track : 'web',
    os: osOf(x.userAgent),
    browser: inApp ? 'The Mac app' : browserOf(x.userAgent),
    page: PAGES[x.view] ?? 'Today',
    space: x.spaceKind,
    window: `${Math.round(x.width)}×${Math.round(x.height)}`,
    theme: x.theme,
  };
}

/** The switch's helper line: "Tudu 0.38.0, macOS, the Today page. Never your tasks." */
export function feedbackDetailsLine(d: FeedbackDetails): string {
  const app = d.track === 'web' ? `Tudu ${d.version} on the web` : `${d.app} ${d.version}`;
  return `${app}, ${d.os}, the ${d.page} page. Never your tasks.`;
}

/** The details as lines for the mail: "App: Tudu 0.38.0 (production)". */
export function feedbackDetailsLines(d: FeedbackDetails): string[] {
  return [
    `App: ${d.app} ${d.version} (${d.track})`,
    `System: ${d.os}, ${d.browser}`,
    `Page: ${d.page}${d.space ? `, in a ${d.space} space` : ''}`,
    `Window: ${d.window}, ${d.theme}`,
  ];
}
