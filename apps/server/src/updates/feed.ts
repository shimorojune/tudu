import { versionIn } from '@tudu/core';

/** The macOS app's update feed reads its own track's GitHub release. */
export type UpdatesTrack = 'production' | 'staging';

export interface FeedOptions {
  track: UpdatesTrack;
  /** owner/name. */
  repo: string;
  /** A token that can read the repository's releases (it is private). */
  token?: string;
  /** GitHub's API, or the fake one in tests. */
  api: string;
  /** The API's public origin: the download address in the manifest is on it. */
  base: string;
  fetch?: typeof fetch;
  ttlMs?: number;
  now?: () => number;
}

/** The release asset names the macOS build uploads: `Tudu.app.tar.gz` and its `.sig` (Tudu Staging's likewise). */
const BUNDLE = /\.app\.tar\.gz$/;
const SIGNATURE = /\.app\.tar\.gz\.sig$/;
/** The address the app downloads from; any other name is not found. */
export const DOWNLOAD_NAME = 'Tudu.app.tar.gz';
/** Answers are kept this long, so many apps checking at once ask GitHub once. */
export const FEED_TTL_MS = 5 * 60 * 1000;

export class FeedError extends Error {
  constructor(
    readonly status: 404 | 502 | 503,
    message: string,
  ) {
    super(message);
  }
}

interface GithubAsset {
  id: number;
  name: string;
  size: number;
  url: string;
}
interface GithubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
  assets: GithubAsset[];
}

export interface Release {
  version: string;
  notes: string;
  date: string | null;
  bundle: GithubAsset;
  signature: string;
}

/** Tauri's update manifest. */
export interface Manifest {
  version: string;
  notes: string;
  pub_date: string | null;
  platforms: Record<string, { signature: string; url: string }>;
}

/**
 * The track's newest release from GitHub: staging reads the rolling `staging` pre-release, production the latest
 * release. Read with a token (the repository is private) and kept five minutes; a failure clears what was kept.
 */
export class UpdateFeed {
  private cached: { at: number; release: Release } | null = null;
  private readonly f: typeof fetch;
  private readonly ttl: number;
  private readonly now: () => number;

  constructor(private readonly o: FeedOptions) {
    this.f = o.fetch ?? globalThis.fetch.bind(globalThis);
    this.ttl = o.ttlMs ?? FEED_TTL_MS;
    this.now = o.now ?? Date.now;
  }

  reset(): void {
    this.cached = null;
  }

  private headers(accept = 'application/vnd.github+json'): Record<string, string> {
    return {
      accept,
      authorization: `Bearer ${this.o.token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'tudu-api',
    };
  }

  private async get(url: string, accept?: string): Promise<Response> {
    let res: Response;
    try {
      res = await this.f(url, { headers: this.headers(accept), redirect: 'follow' });
    } catch {
      throw new FeedError(502, 'GitHub could not be reached.');
    }
    if (res.status === 404) throw new FeedError(404, 'No release yet.');
    if (!res.ok) throw new FeedError(502, `GitHub answered ${res.status}.`);
    return res;
  }

  async release(): Promise<Release> {
    if (!this.o.token) throw new FeedError(503, 'Updates are not set up here.');
    if (this.cached && this.now() - this.cached.at < this.ttl) return this.cached.release;
    try {
      const api = this.o.api.replace(/\/$/, '');
      const path =
        this.o.track === 'staging'
          ? `/repos/${this.o.repo}/releases/tags/staging`
          : `/repos/${this.o.repo}/releases/latest`;
      const r = (await (await this.get(api + path)).json()) as GithubRelease;
      const version = versionIn(r.tag_name) ?? versionIn(r.name ?? '');
      const bundle = r.assets.find((a) => BUNDLE.test(a.name));
      const sig = r.assets.find((a) => SIGNATURE.test(a.name));
      if (!version || !bundle || !sig) throw new FeedError(404, 'The release has no app update.');
      const signature = (await (await this.get(sig.url, 'application/octet-stream')).text()).trim();
      const release: Release = {
        version,
        notes: r.body ?? '',
        date: r.published_at,
        bundle,
        signature,
      };
      this.cached = { at: this.now(), release };
      return release;
    } catch (err) {
      this.cached = null;
      throw err;
    }
  }

  async manifest(): Promise<Manifest> {
    const r = await this.release();
    const url = `${this.o.base.replace(/\/$/, '')}/updates/download/${DOWNLOAD_NAME}`;
    return {
      version: r.version,
      notes: r.notes,
      pub_date: r.date,
      // Built on Apple silicon (the macOS runner); the same entry serves the tar.gz updater for both names Tauri asks.
      platforms: {
        'darwin-aarch64': { signature: r.signature, url },
        'darwin-aarch64-app': { signature: r.signature, url },
      },
    };
  }

  /** The bundle itself, streamed from the release with its size and type. */
  async download(): Promise<Response> {
    const r = await this.release();
    const res = await this.get(r.bundle.url, 'application/octet-stream');
    return new Response(res.body, {
      headers: {
        'content-type': 'application/gzip',
        'content-length': String(r.bundle.size),
        'cache-control': 'no-store',
      },
    });
  }
}
