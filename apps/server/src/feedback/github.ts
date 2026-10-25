import type { FeedbackIssue } from '@tudu/core';

/** What a tracker files: the title, body and labels, already built from the report alone. */
export interface IssueDraft {
  title: string;
  body: string;
  labels: string[];
}

/** Where reports become public issues. GitHub in production; tests point it at the fake. */
export interface IssueTracker {
  file(draft: IssueDraft): Promise<FeedbackIssue>;
}

/**
 * A failure filing an issue. `retryable` ones (no connection, a timeout, GitHub down or rate-limiting us) wait for
 * the sweep; the rest (a bad or expired token, the repository gone, a refused body) never get better by trying.
 */
export class IssueError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** GitHub answers within this or the report waits for the sweep, so the form never hangs on it. */
export const ISSUE_TIMEOUT_MS = 8000;

/** Files issues with a fine-grained token that can only write this repository's issues. */
export class GithubIssues implements IssueTracker {
  constructor(
    private readonly opts: {
      token: string;
      repo: string;
      api: string;
      fetch?: typeof fetch;
      timeoutMs?: number;
    },
  ) {}

  async file(draft: IssueDraft): Promise<FeedbackIssue> {
    const go = this.opts.fetch ?? fetch;
    let res: Response;
    try {
      res = await go(`${this.opts.api}/repos/${this.opts.repo}/issues`, {
        method: 'POST',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${this.opts.token}`,
          'content-type': 'application/json',
          'user-agent': 'tudu-feedback',
          'x-github-api-version': '2022-11-28',
        },
        body: JSON.stringify(draft),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? ISSUE_TIMEOUT_MS),
      });
    } catch (err) {
      throw new IssueError(
        `GitHub did not answer: ${err instanceof Error ? err.message : String(err)}`,
        true,
      );
    }
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { number?: unknown; html_url?: unknown } | null;
      if (typeof json?.number !== 'number' || typeof json.html_url !== 'string')
        throw new IssueError('GitHub answered without an issue number.', true);
      return { number: json.number, url: json.html_url };
    }
    const limited =
      res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');
    const retryable = limited || res.status >= 500;
    const detail = await res.text().catch(() => '');
    throw new IssueError(`GitHub answered ${res.status}: ${detail.slice(0, 200)}`, retryable);
  }
}
