/** Where the API lives. The web app reads it from VITE_API_URL; tests pass it in. */
export interface ApiConfig {
  baseUrl: string;
  fetch?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** A small JSON client that always sends cookies and turns non-2xx into ApiError with the server's plain message. */
export function createApi(config: ApiConfig) {
  const f = config.fetch ?? globalThis.fetch.bind(globalThis);
  const base = config.baseUrl.replace(/\/$/, '');
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    init: RequestInit = {},
  ): Promise<T> {
    const res = await f(`${base}${path}`, {
      method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    });
    const text = await res.text();
    const data: unknown = text ? safeJson(text) : null;
    if (!res.ok) {
      const message =
        (data as { error?: string; message?: string } | null)?.error ??
        (data as { message?: string } | null)?.message ??
        res.statusText;
      throw new ApiError(res.status, message, data);
    }
    return data as T;
  }
  return {
    baseUrl: base,
    get: <T>(path: string, init?: RequestInit) => request<T>('GET', path, undefined, init),
    post: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>('POST', path, body, init),
    patch: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>('PATCH', path, body, init),
    delete: <T>(path: string, init?: RequestInit) => request<T>('DELETE', path, undefined, init),
  };
}

export type Api = ReturnType<typeof createApi>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
