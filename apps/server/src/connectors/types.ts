import type { ConnectorProvider } from '@tudu/core';
import type { TokenSeal } from './seal';

/** How the server reaches the apps: in production only https and never a private address. */
export interface ConnectorHttp {
  production: boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
  resolve?: (host: string) => Promise<string[]>;
}

export interface ConnectorDeps {
  seal: TokenSeal;
  http: ConnectorHttp;
}

/** One app's account, as its own answer gives it. */
export interface ConnectorWho {
  name: string;
  email: string;
}

/** A token opened against one site: what every connector can answer. */
export interface ConnectorClient {
  /** Who the token is; refuses a token the app does not take, and an address that is not this app. */
  who(): Promise<ConnectorWho>;
  /** The keys of the open issues assigned to you, the first `max`; the count is made from these. */
  assigned(max: number): Promise<string[]>;
}

/**
 * The seam a connector implements. The connection, its switches, its views and the task links are the same for
 * every app (connectors/service.ts); what a list or an issue looks like is the app's own (jira/service.ts).
 */
export interface Connector<C extends ConnectorClient = ConnectorClient> {
  provider: ConnectorProvider;
  /** What is wrong with the address as typed, before anything is sent; null when it is fine. */
  siteProblem(site: string): string | null;
  /** The address kept: no trailing slash, no query. */
  normalSite(site: string): string;
  open(site: string, token: string, http: ConnectorHttp): C;
  /** The app's own words for a token that stopped working, and for a fresh one it refuses. */
  words: { expired: string; refused: string };
}
