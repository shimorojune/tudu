import type {
  SyncBootstrapResponse,
  SyncOp,
  SyncPushResponse,
} from "@tudu/shared";
import { resolveTuduApiUrl } from "./env.js";

export type TuduApiError = {
  status: number;
  message: string;
};

export class TuduApiClientError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type TuduApi = ReturnType<typeof createTuduApi>;

export function createTuduApi(token: string) {
  const baseUrl = resolveTuduApiUrl();

  async function request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new TuduApiClientError(
        response.status,
        body.error ?? `Request failed (${response.status})`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    get: request,
    sync(op: SyncOp): Promise<SyncPushResponse> {
      return request("/sync", {
        method: "POST",
        body: JSON.stringify({
          clientMutationId: crypto.randomUUID(),
          op,
        }),
      });
    },
    bootstrap(views: string[]) {
      return request<SyncBootstrapResponse>("/sync/bootstrap", {
        method: "POST",
        body: JSON.stringify({ views }),
      });
    },
  };
}
