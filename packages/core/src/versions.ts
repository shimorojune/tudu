/**
 * The macOS app's versions and tracks: Tudu (production), Tudu Staging and Tudu Test each update from their own
 * feed. Staging builds are `<next patch>-staging.<run>`, so each is newer than the last staging build and the release
 * it follows, and older than the next release.
 */

export type Track = 'production' | 'staging' | 'test';

export const TRACKS: Record<Track, { name: string; identifier: string }> = {
  production: { name: 'Tudu', identifier: 'net.ezdev.tudu' },
  staging: { name: 'Tudu Staging', identifier: 'net.ezdev.tudu.staging' },
  test: { name: 'Tudu Test', identifier: 'net.ezdev.tudu.test' },
};

export function trackName(track: Track): string {
  return TRACKS[track].name;
}

interface Parsed {
  core: [number, number, number];
  pre: Array<string | number>;
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** A version's parts, or null when it is not one ("tudu-0.37.0" is read as 0.37.0). */
export function parseVersion(v: string): Parsed | null {
  const m = SEMVER.exec(v.trim().replace(/^tudu-/, ''));
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [],
  };
}

/** The version in a tag or a release name: "tudu-0.37.0" → "0.37.0", "Tudu Staging 0.37.1-staging.4" → that. */
export function versionIn(text: string): string | null {
  const m = /(?<!\d)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(text);
  return m && parseVersion(m[1]!) ? m[1]! : null;
}

/** Semantic version order: negative when a is older than b. A pre-release is older than its release. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) throw new Error(`Not a version: ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i]! - y.core[i]!;
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    if (typeof p === 'number' && typeof q === 'number') return p - q;
    if (typeof p === 'number') return -1;
    if (typeof q === 'number') return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/** A staging build's version: the next patch after the last release, then the run. 0.37.0 and run 132 → 0.37.1-staging.132. */
export function stagingVersion(released: string, run: number): string {
  const v = parseVersion(released);
  if (!v) throw new Error(`Not a version: ${released}`);
  return `${v.core[0]}.${v.core[1]}.${v.core[2] + 1}-staging.${run}`;
}

/** Where a build came from: one of the app's tracks, or a local `vite` dev server. */
export type BuildTrack = Track | 'dev';

export const RELEASES_URL = 'https://github.com/shimorojune/tudu/releases';

/**
 * The GitHub release a build belongs to: a release's own tag ("tudu-0.37.0"), the rolling `staging` pre-release for
 * any staging build, and nothing for Tudu Test and dev builds, which are never released.
 */
export function releaseUrl(track: BuildTrack, version: string): string | null {
  if (track === 'staging') return `${RELEASES_URL}#release-staging`;
  if (track === 'production' && parseVersion(version))
    return `${RELEASES_URL}/tag/tudu-${version.replace(/^v/, '')}`;
  return null;
}

/** The Inbox line after the app's name: "is ready: version 0.38.0". */
export function readyText(version: string): string {
  return `is ready: version ${version}`;
}

/** Settings › This Mac › Updates: "Checked just now", "Checked 12 minutes ago", "Checked 3 hours ago", "Checked 2 days ago". */
export function checkedWords(at: string, now: Date): string {
  const mins = Math.floor((now.getTime() - new Date(at).getTime()) / 60_000);
  if (!(mins >= 1)) return 'Checked just now';
  if (mins < 60) return `Checked ${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Checked ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Checked ${days} day${days === 1 ? '' : 's'} ago`;
}

/** "Tudu is ready: version 0.38.0". */
export function readyWords(version: string, name = 'Tudu'): string {
  return `${name} ${readyText(version)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Inline markdown as plain words with bold kept: links lose their address, commit references go. */
function inline(s: string): string {
  const text = s
    // "([abc1234](https://…/commit/abc1234))" and "(#12)" after a line
    .replace(/\(\[[0-9a-f]{7,40}\]\([^)]*\)\)/g, '')
    .replace(/\(\[#\d+\]\([^)]*\)\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/**
 * A release's notes (semantic-release markdown) as clean HTML for the Inbox: the version heading goes, section
 * headings become short bold lines, bullets become a list, links keep only their words.
 */
export function notesHtml(markdown: string | null | undefined): string {
  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => {
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join('')}</ul>`);
    list = [];
  };
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.join(' ')}</p>`);
    para = [];
  };
  for (const raw of (markdown ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      continue;
    }
    const h = /^#{1,6}\s(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      // The release's own heading ("## [0.38.0](…) (2026-10-30)") says nothing the item does not.
      if (/^\[?\d+\.\d+\.\d+/.test(h[1]!.trim())) continue;
      out.push(`<p><strong>${inline(h[1]!.replace(/\*\*/g, ''))}</strong></p>`);
      continue;
    }
    const b = /^[*-]\s(.*)$/.exec(line);
    if (b) {
      flushPara();
      list.push(inline(b[1]!));
      continue;
    }
    flushList();
    para.push(inline(line));
  }
  flushPara();
  flushList();
  return out.join('');
}
