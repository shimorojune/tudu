import type { FeedbackIssue } from '@tudu/core';

/** What a tracker files: the title, body and labels, already built from the report alone. */
export interface IssueDraft {
  title: string;
  body: string;
  labels: string[];
}

/** An issue as the mirror keeps it (#76), straight from GitHub's list. */
export interface ListedIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  stateReason: string | null;
  locked: boolean;
  url: string;
  createdAt: Date;
  closedAt: Date | null;
  updatedAt: Date;
}

/** Where reports become public issues. GitHub in production; tests point it at the fake. */
export interface IssueTracker {
  file(draft: IssueDraft): Promise<FeedbackIssue>;
  /** "+1 that one instead": a comment on an issue. `url` is the comment's. */
  comment(issue: number, body: string): Promise<FeedbackIssue>;
  /** Every issue (open and closed, no pull requests) changed since `since`, oldest change first. */
  list(since?: Date | null): Promise<ListedIssue[]>;
  /** Issues the whole app may file in an hour; ISSUES_PER_HOUR when left out. */
  perHour?: number;
}

/**
 * A failure filing an issue. `retryable` ones (no connection, a timeout, GitHub down or rate-limiting us) wait for
 * the sweep; the rest (a bad or expired token, the repository gone, a refused body) never get better by trying.
 */
export class IssueError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** GitHub's status, when it answered. */
    readonly status?: number,
  ) {
    super(message);
  }
}

/** GitHub answers within this or the report waits for the sweep, so the form never hangs on it. */
export const ISSUE_TIMEOUT_MS = 8000;

/** Files issues with a fine-grained token that can only write this repository's issues. */
/** The mirror reads at most this many pages a sync (100 issues each); the rest come next time. */
export const LIST_MAX_PAGES = 20;

export class GithubIssues implements IssueTracker {
  constructor(
    private readonly opts: {
      token: string;
      repo: string;
      api: string;
      fetch?: typeof fetch;
      timeoutMs?: number;
      perHour?: number;
    },
  ) {
    this.perHour = opts.perHour;
  }

  readonly perHour?: number;

  private headers(): Record<string, string> {
    return {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${this.opts.token}`,
      'content-type': 'application/json',
      'user-agent': 'tudu-feedback',
      'x-github-api-version': '2022-11-28',
    };
  }

  /** One call to GitHub; a failure is an IssueError saying whether trying again can help. */
  private async call(path: string, init: { method: string; body?: unknown }): Promise<Response> {
    const go = this.opts.fetch ?? fetch;
    let res: Response;
    try {
      res = await go(path.startsWith('http') ? path : `${this.opts.api}${path}`, {
        method: init.method,
        headers: this.headers(),
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? ISSUE_TIMEOUT_MS),
      });
    } catch (err) {
      throw new IssueError(
        `GitHub did not answer: ${err instanceof Error ? err.message : String(err)}`,
        true,
      );
    }
    if (res.ok) return res;
    const limited =
      res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');
    const retryable = limited || res.status >= 500;
    const detail = await res.text().catch(() => '');
    throw new IssueError(`GitHub answered ${res.status}: ${detail.slice(0, 200)}`, retryable, res.status);
  }

  async file(draft: IssueDraft): Promise<FeedbackIssue> {
    const res = await this.call(`/repos/${this.opts.repo}/issues`, { method: 'POST', body: draft });
    const json = (await res.json().catch(() => null)) as { number?: unknown; html_url?: unknown } | null;
    if (typeof json?.number !== 'number' || typeof json.html_url !== 'string')
      throw new IssueError('GitHub answered without an issue number.', true);
    return { number: json.number, url: json.html_url };
  }

  async comment(issue: number, body: string): Promise<FeedbackIssue> {
    const res = await this.call(`/repos/${this.opts.repo}/issues/${issue}/comments`, {
      method: 'POST',
      body: { body },
    });
    const json = (await res.json().catch(() => null)) as { html_url?: unknown } | null;
    if (typeof json?.html_url !== 'string') throw new IssueError('GitHub answered without a comment.', true);
    return { number: issue, url: json.html_url };
  }

  async list(since?: Date | null): Promise<ListedIssue[]> {
    const q = new URLSearchParams({ state: 'all', sort: 'updated', direction: 'asc', per_page: '100' });
    if (since) q.set('since', since.toISOString());
    let next: string | null = `/repos/${this.opts.repo}/issues?${q}`;
    const out: ListedIssue[] = [];
    for (let page = 0; next && page < LIST_MAX_PAGES; page++) {
      const res = await this.call(next, { method: 'GET' });
      const items = (await res.json().catch(() => null)) as unknown;
      if (!Array.isArray(items)) throw new IssueError('GitHub answered without a list of issues.', true);
      for (const raw of items as Array<Record<string, unknown>>) {
        const it = listedIssue(raw);
        if (it) out.push(it);
      }
      next = nextLink(res.headers.get('link'));
    }
    return out;
  }
}

/** The `rel="next"` page of a Link header, if there is one. */
export function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (m) return m[1]!;
  }
  return null;
}

/** One item of GitHub's issue list as the mirror keeps it; pull requests (and anything malformed) are left out. */
export function listedIssue(raw: Record<string, unknown>): ListedIssue | null {
  if (raw.pull_request) return null;
  const { number, title, state, html_url, created_at, updated_at } = raw;
  if (typeof number !== 'number' || typeof title !== 'string' || typeof html_url !== 'string') return null;
  if (state !== 'open' && state !== 'closed') return null;
  if (typeof created_at !== 'string' || typeof updated_at !== 'string') return null;
  return {
    number,
    title,
    body: typeof raw.body === 'string' ? raw.body : null,
    state,
    stateReason: typeof raw.state_reason === 'string' ? raw.state_reason : null,
    locked: raw.locked === true,
    url: html_url,
    createdAt: new Date(created_at),
    closedAt: typeof raw.closed_at === 'string' ? new Date(raw.closed_at) : null,
    updatedAt: new Date(updated_at),
  };
}
