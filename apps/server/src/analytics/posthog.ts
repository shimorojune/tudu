import { syncOpToAnalytics, type SyncOp } from "@tudu/shared";
import { PostHog } from "posthog-node";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

let client: PostHog | null = null;

function analyticsKey(): string | undefined {
  const key = process.env.POSTHOG_API_KEY;
  return key && key.length > 0 ? key : undefined;
}

function analyticsHost(): string {
  const host = process.env.POSTHOG_HOST;
  return host && host.length > 0 ? host : DEFAULT_POSTHOG_HOST;
}

function getClient(): PostHog | null {
  if (client) {
    return client;
  }
  const key = analyticsKey();
  if (!key) {
    return null;
  }
  client = new PostHog(key, {
    host: analyticsHost(),
    flushAt: 10,
    flushInterval: 5000,
  });
  return client;
}

export function captureAnalyticsEvent(
  distinctId: string,
  event: string,
  properties: Record<string, string | number | boolean>,
  insertId?: string,
): void {
  const ph = getClient();
  if (!ph) {
    return;
  }

  ph.capture({
    distinctId,
    event,
    properties: { ...properties, origin: "server" },
    uuid: insertId,
  });
}

export type CaptureSyncOpExtras = {
  client_mutation_id?: string;
};

export function captureSyncOp(
  userId: string,
  op: SyncOp,
  extras?: CaptureSyncOpExtras,
): void {
  const mapped = syncOpToAnalytics(op);
  if (!mapped) {
    return;
  }

  captureAnalyticsEvent(
    userId,
    mapped.event,
    mapped.properties,
    extras?.client_mutation_id,
  );
}

export function captureSyncFailed(
  userId: string,
  opType: string,
  status?: number,
  clientMutationId?: string,
): void {
  const properties: Record<string, string | number | boolean> = {
    op_type: opType,
  };
  if (status !== undefined) {
    properties.status = status;
  }
  captureAnalyticsEvent(userId, "sync_failed", properties, clientMutationId);
}

export async function shutdownAnalytics(): Promise<void> {
  if (!client) {
    return;
  }
  await client.shutdown();
  client = null;
}
