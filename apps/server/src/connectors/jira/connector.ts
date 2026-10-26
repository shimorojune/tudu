import { JIRA_ASSIGNED_JQL, normalSite, siteProblem } from '@tudu/core';
import type { Connector, ConnectorClient, ConnectorHttp } from '../types';
import { EXPIRED, JiraFailure, JiraHttp, TOKEN_REFUSED } from './http';

/** Jira Data Center: a site and a personal access token, read over its REST API. */
export class JiraClient implements ConnectorClient {
  readonly http: JiraHttp;

  constructor(site: string, token: string, http: ConnectorHttp) {
    this.http = new JiraHttp(site, token, http);
  }

  who() {
    return this.http.myself();
  }

  async assigned(max: number): Promise<string[]> {
    return (await this.http.search(JIRA_ASSIGNED_JQL, max, 'key')).issues.map((i) => i.key);
  }
}

export const jiraConnector: Connector<JiraClient> = {
  provider: 'jira',
  siteProblem,
  normalSite,
  open: (site, token, http) => new JiraClient(site, token, http),
  words: { expired: EXPIRED, refused: TOKEN_REFUSED },
};

export { JiraFailure };
