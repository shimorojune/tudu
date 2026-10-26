import { isConnectorProvider, type ConnectorProvider } from '@tudu/core';
import { jiraConnector } from './jira/connector';
import type { Connector } from './types';

/** Every app Tudu can connect, by its provider name. A second app is one more line here. */
const CONNECTORS: { [P in ConnectorProvider]: Connector } = {
  jira: jiraConnector,
};

export function connectorOf(provider: ConnectorProvider): Connector {
  return CONNECTORS[provider];
}

/** The provider named in a path, or null when Tudu has no such app. */
export function providerFrom(x: string | undefined): ConnectorProvider | null {
  return isConnectorProvider(x) ? x : null;
}
