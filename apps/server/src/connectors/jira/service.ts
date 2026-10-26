import {
  JIRA_ASSIGNED_JQL,
  JIRA_ASSIGNED_VIEW,
  JIRA_PAGE,
  parseJiraKey,
  type JiraIssue,
  type JiraIssueDetail,
  type JiraIssuesResponse,
} from '@tudu/core';
import type { Db } from '@tudu/db';
import { needOnHere, viewsOf, withConnection } from '../service';
import type { ConnectorDeps } from '../types';
import type { JiraClient } from './connector';
import { JiraFailure } from './http';

/** One list: the assigned view, a saved view by id, or a JQL of your own, in Jira's order. Only where Jira is on. */
export async function issues(
  db: Db,
  deps: ConnectorDeps,
  userId: string,
  spaceId: string,
  ask: { view?: string; jql?: string },
): Promise<JiraIssuesResponse> {
  const c = await needOnHere(db, userId, spaceId, 'jira');
  let jql: string;
  if (ask.jql !== undefined) jql = ask.jql.trim();
  else if (!ask.view || ask.view === JIRA_ASSIGNED_VIEW) jql = JIRA_ASSIGNED_JQL;
  else {
    const v = (await viewsOf(db, c.id)).find((x) => x.id === ask.view);
    if (!v) throw new JiraFailure('not-found', 'That view isn’t there any more.', 404);
    jql = v.jql;
  }
  if (!jql) throw new JiraFailure('jql', 'Write a JQL query first.', 400);
  const r = await withConnection<{ issues: JiraIssue[]; total: number }, JiraClient>(db, deps, c, (j) =>
    j.http.search(jql, JIRA_PAGE),
  );
  return { issues: r.issues, total: r.total, syncedAt: c.syncedAt!.toISOString() };
}

export async function issue(
  db: Db,
  deps: ConnectorDeps,
  userId: string,
  spaceId: string,
  key: string,
): Promise<JiraIssueDetail> {
  const c = await needOnHere(db, userId, spaceId, 'jira');
  const k = parseJiraKey(key);
  if (!k) throw new JiraFailure('not-found', 'That isn’t a Jira issue key.', 404);
  return withConnection<JiraIssueDetail, JiraClient>(db, deps, c, (j) => j.http.issue(k));
}

/** A word for JQL's text search: its quotes and backslashes escaped, Jira's reserved characters dropped. */
function jqlText(q: string): string {
  return q
    .replace(/[+\-&|!(){}[\]^~*?:\\/"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Search across all of Jira: a key typed in full first, then summaries and text that hold the words. */
export async function searchJira(
  db: Db,
  deps: ConnectorDeps,
  userId: string,
  spaceId: string,
  q: string,
): Promise<JiraIssuesResponse> {
  const c = await needOnHere(db, userId, spaceId, 'jira');
  const words = jqlText(q);
  const key = parseJiraKey(q);
  return withConnection<JiraIssuesResponse, JiraClient>(db, deps, c, async ({ http: h }) => {
    const out: JiraIssue[] = [];
    if (key)
      try {
        const d = await h.issue(key);
        out.push({ key: d.key, summary: d.summary, status: d.status, due: d.due, updated: d.updated });
      } catch (err) {
        if (!(err instanceof JiraFailure) || err.code !== 'not-found') throw err;
      }
    let total = out.length;
    if (words && (!key || !out.length)) {
      const r = await h.search(`text ~ "${words}" ORDER BY updated DESC`, JIRA_PAGE);
      for (const i of r.issues) if (!out.some((x) => x.key === i.key)) out.push(i);
      total = Math.max(r.total, out.length);
    }
    return { issues: out, total, syncedAt: new Date().toISOString() };
  });
}
