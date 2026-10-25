import {
  cleanHtml,
  isEmptyHtml,
  type JiraComment,
  type JiraErrorCode,
  type JiraIssue,
  type JiraIssueDetail,
} from '@tudu/core';
import { ConnectorFailure as JiraFailure } from '../failure';
import { checkSite } from './guard';

/** Jira said no, or did not answer: the connectors' failure, by the name this file has always used. */
export { JiraFailure };

export const UNREACHABLE =
  'Couldn’t reach Jira at this address. Check it, or that you’re on your company network.';
export const PRIVATE = 'Couldn’t reach Jira at this address.';
export const NOT_HTTPS = 'Use your Jira’s https address.';
export const TOKEN_REFUSED = 'Jira didn’t accept this token. Check it, or make a new one.';
export const NO_READ = 'This token can’t read issues. Make one that can.';
export const EXPIRED = 'Your Jira token has expired.';
export const NOT_JIRA = 'That address didn’t answer like Jira. Check it.';

/** A request takes at most this long before Jira counts as unreachable. */
export const JIRA_TIMEOUT_MS = 10_000;

export interface JiraHttpOptions {
  fetch?: typeof fetch;
  /** Only https, and never a private address. */
  production: boolean;
  timeoutMs?: number;
  resolve?: (host: string) => Promise<string[]>;
}

const LIST_FIELDS = 'summary,status,duedate,updated';
const DETAIL_FIELDS = `${LIST_FIELDS},issuetype,assignee,priority,description,comment`;
/** The preview shows the last few; this many are read. */
const COMMENTS_KEPT = 20;

interface RawIssue {
  key: string;
  fields?: {
    summary?: string;
    status?: { name?: string } | null;
    duedate?: string | null;
    updated?: string | null;
    issuetype?: { name?: string } | null;
    assignee?: { displayName?: string; name?: string } | null;
    priority?: { name?: string } | null;
    comment?: {
      total?: number;
      comments?: Array<{ id: string; author?: { displayName?: string }; created?: string; body?: string }>;
    };
  };
  renderedFields?: {
    description?: string | null;
    comment?: { comments?: Array<{ id: string; body?: string }> };
  };
}

/** Jira writes "2026-10-17T10:12:00.000+0000"; this is the same instant in ISO 8601. */
export function jiraInstant(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function plainText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function toIssue(r: RawIssue): JiraIssue {
  const f = r.fields ?? {};
  return {
    key: r.key,
    summary: f.summary ?? '',
    status: f.status?.name ?? '',
    due: f.duedate && /^\d{4}-\d{2}-\d{2}$/.test(f.duedate) ? f.duedate : null,
    updated: jiraInstant(f.updated),
  };
}

/** Rendered HTML from Jira, its links made absolute, through the same cleaner the notes use. */
export function cleanJiraHtml(html: string | null | undefined, site: string): string {
  if (!html) return '';
  const abs = html.replace(/\b(href)="\/(?!\/)/gi, `$1="${site}/`);
  const out = cleanHtml(abs);
  return isEmptyHtml(out) ? '' : out;
}

export function toDetail(r: RawIssue, site: string): JiraIssueDetail {
  const f = r.fields ?? {};
  const all = f.comment?.comments ?? [];
  const rendered = new Map((r.renderedFields?.comment?.comments ?? []).map((c) => [c.id, c.body ?? '']));
  const comments: JiraComment[] = all.slice(-COMMENTS_KEPT).map((c) => ({
    id: c.id,
    who: c.author?.displayName ?? 'Someone',
    at: jiraInstant(c.created) ?? '',
    html: cleanJiraHtml(rendered.get(c.id), site) || (c.body ? `<p>${plainText(c.body)}</p>` : ''),
  }));
  return {
    ...toIssue(r),
    issuetype: f.issuetype?.name ?? null,
    assignee: f.assignee?.displayName ?? f.assignee?.name ?? null,
    priority: f.priority?.name ?? null,
    description: cleanJiraHtml(r.renderedFields?.description, site),
    comments,
    commentTotal: f.comment?.total ?? all.length,
  };
}

/** Jira's own reason for a JQL it can't run. */
function jqlReason(body: unknown): string {
  const b = body as { errorMessages?: string[]; errors?: Record<string, string> } | null;
  const msgs = [...(b?.errorMessages ?? []), ...Object.values(b?.errors ?? {})].filter(Boolean);
  return msgs.join(' ') || 'Check the query and try again.';
}

/**
 * Jira Data Center over its REST API (version 2) with a personal access token. Every answer that is not what
 * was asked for becomes a JiraFailure with plain words; the token is never put into a message.
 */
export class JiraHttp {
  private readonly f: typeof fetch;

  constructor(
    readonly site: string,
    private readonly token: string,
    private readonly o: JiraHttpOptions,
  ) {
    this.f = o.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async call(
    path: string,
    query: Record<string, string> = {},
  ): Promise<{ status: number; body: unknown }> {
    const guard = await checkSite(this.site, this.o.production, this.o.resolve);
    if (!guard.ok) {
      if (guard.why === 'not-https') throw new JiraFailure('not-address', NOT_HTTPS, 400, 'site');
      if (guard.why === 'private') throw new JiraFailure('private-address', PRIVATE, 400, 'site');
      throw new JiraFailure('unreachable', UNREACHABLE, 502, 'site');
    }
    const qs = new URLSearchParams(query).toString();
    let res: Response;
    try {
      res = await this.f(`${this.site}/rest/api/2/${path}${qs ? `?${qs}` : ''}`, {
        headers: { authorization: `Bearer ${this.token}`, accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(this.o.timeoutMs ?? JIRA_TIMEOUT_MS),
      });
    } catch {
      throw new JiraFailure('unreachable', UNREACHABLE, 502, 'site');
    }
    const text = await res.text().catch(() => '');
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = undefined;
    }
    if (res.status >= 500 || (res.status >= 300 && res.status < 400))
      throw new JiraFailure('unreachable', UNREACHABLE, 502, 'site');
    return { status: res.status, body };
  }

  /** Who the token is; refuses a token Jira does not accept, and an address that is not a Jira. */
  async myself(): Promise<{ name: string; email: string }> {
    const { status, body } = await this.call('myself');
    if (status === 401 || status === 403) throw new JiraFailure('token-refused', TOKEN_REFUSED, 400, 'token');
    const b = body as { displayName?: string; name?: string; emailAddress?: string } | null | undefined;
    if (status !== 200 || !b || typeof b !== 'object' || !(b.name || b.displayName))
      throw new JiraFailure('unreachable', NOT_JIRA, 400, 'site');
    return { name: b.displayName ?? b.name ?? '', email: b.emailAddress ?? '' };
  }

  /** The issues a JQL finds, in Jira's order. A 401 here is a token that stopped working. */
  async search(
    jql: string,
    max: number,
    fields = LIST_FIELDS,
  ): Promise<{ issues: JiraIssue[]; total: number }> {
    const { status, body } = await this.call('search', { jql, fields, maxResults: String(max) });
    if (status === 401) throw new JiraFailure('expired', EXPIRED, 401);
    if (status === 403) throw new JiraFailure('no-read', NO_READ, 403, 'token');
    if (status === 400) throw new JiraFailure('jql', jqlReason(body), 400);
    const b = body as { issues?: RawIssue[]; total?: number } | null | undefined;
    if (status !== 200 || !b || !Array.isArray(b.issues)) throw new JiraFailure('unreachable', NOT_JIRA, 502);
    return { issues: b.issues.map(toIssue), total: b.total ?? b.issues.length };
  }

  /** One issue in full, with its rendered description and comments. */
  async issue(key: string): Promise<JiraIssueDetail> {
    const { status, body } = await this.call(`issue/${encodeURIComponent(key)}`, {
      fields: DETAIL_FIELDS,
      expand: 'renderedFields',
    });
    if (status === 401) throw new JiraFailure('expired', EXPIRED, 401);
    if (status === 403 || status === 404)
      throw new JiraFailure('not-found', `${key} isn’t in Jira, or this token can’t see it.`, 404);
    const b = body as RawIssue | null | undefined;
    if (status !== 200 || !b?.key) throw new JiraFailure('unreachable', NOT_JIRA, 502);
    return toDetail(b, this.site);
  }
}
