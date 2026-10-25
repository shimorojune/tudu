import { parseJiraKey } from './jira';

/**
 * The apps a person can connect. Each one is connected once, for the account, and turned on per space; a task can
 * be linked to one issue in each. A second app is a new value here, its adapter on the server, and its UI.
 */
export const CONNECTOR_PROVIDERS = ['jira'] as const;
export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export function isConnectorProvider(x: unknown): x is ConnectorProvider {
  return typeof x === 'string' && (CONNECTOR_PROVIDERS as readonly string[]).includes(x);
}

/** The longest key any app's issue may have. */
export const LINK_KEY_MAX = 64;

/** A task's link to an outside issue: only the key, as words ("TUDU-212"). */
export interface TaskLink {
  provider: ConnectorProvider;
  key: string;
}

/** The key in a person's words, as that app writes it, or null when it is not one of its keys. */
export function parseLinkKey(provider: ConnectorProvider, text: string): string | null {
  switch (provider) {
    case 'jira':
      return parseJiraKey(text);
  }
}

/** The task's key in one app, or null. */
export function linkKeyOf(
  links: readonly TaskLink[] | undefined,
  provider: ConnectorProvider,
): string | null {
  return links?.find((l) => l.provider === provider)?.key ?? null;
}

/** The links with one app's set to `key` (null takes it off), the others untouched, in provider order. */
export function withLink(
  links: readonly TaskLink[],
  provider: ConnectorProvider,
  key: string | null,
): TaskLink[] {
  const rest = links.filter((l) => l.provider !== provider);
  const next = key ? [...rest, { provider, key }] : rest;
  return next.sort(
    (a, b) => CONNECTOR_PROVIDERS.indexOf(a.provider) - CONNECTOR_PROVIDERS.indexOf(b.provider),
  );
}

/** One of your spaces in Settings › Apps, with your switch for an app there. */
export interface ConnectorSpace {
  id: string;
  name: string;
  kind: 'personal' | 'team';
  color: string | null;
  on: boolean;
  /** Your tasks there linked to an issue in this app. */
  linked: number;
}

export interface ConnectorSpacesResponse {
  spaces: ConnectorSpace[];
}

/** The live event: your connection to an app changed (connected, expired, a space turned on, a view saved). */
export const CONNECTOR_CHANGED = 'connector.changed';
export interface ConnectorChangedEvent {
  provider: ConnectorProvider;
}
