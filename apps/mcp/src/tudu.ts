/**
 * The Tudu API, as the caller. The MCP server keeps no data and no secrets of its own: every call carries the
 * caller's key or app token, so the API decides what it may see and change.
 */
export interface Access {
  user: { id: string; name: string; email: string };
  access:
    | { kind: 'session' }
    | {
        kind: 'key' | 'app';
        /** The key's id, or the app's OAuth client id. */
        id: string;
        name: string;
        level: 'read' | 'write';
        canDelete: boolean;
        spaces: string[] | null;
        notebook: boolean;
      };
}

export class TuduError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Tudu {
  get<T>(path: string): Promise<T>;
  sync(mutations: Array<{ type: string; payload: Record<string, unknown> }>): Promise<SyncAnswer>;
}

export interface SyncAnswer {
  results: Array<{ id: string; status: 'ok' | 'rejected'; code?: number; error?: string }>;
  tasks: TaskRow[];
  deleted: string[];
}

export interface TaskRow {
  id: string;
  spaceId: string;
  ref: string | null;
  title: string;
  day: string | null;
  done: boolean;
  due: string | null;
  projectId: string | null;
  visibility: 'space' | 'me';
  ownerId: string | null;
}

export function tuduFor(apiUrl: string, token: string, fetchImpl: typeof fetch = fetch): Tudu {
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetchImpl(new URL(path, apiUrl), {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init?.headers },
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new TuduError(res.status, body?.error ?? `Tudu answered ${res.status}.`);
    return body as T;
  };
  // One id per process is enough: the live stream uses it to tell a tab's own changes from others'.
  const clientId = `mcp-${crypto.randomUUID()}`;
  return {
    get: (path) => call(path),
    async sync(mutations) {
      const at = new Date().toISOString();
      const out = await call<SyncAnswer>('/api/sync', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          mutations: mutations.map((m) => ({ id: crypto.randomUUID(), at, ...m })),
        }),
      });
      const bad = out.results.find((r) => r.status === 'rejected');
      if (bad) throw new TuduError(bad.code ?? 400, bad.error ?? 'Tudu turned that change down.');
      return out;
    },
  };
}
