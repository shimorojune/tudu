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
  /** Send a file as form data, with progress when the browser can report it (XHR), else plain fetch. */
  async function upload<T>(path: string, form: FormData, onProgress?: (ratio: number) => void): Promise<T> {
    if (typeof XMLHttpRequest === 'undefined' || config.fetch) {
      const res = await f(`${base}${path}`, { method: 'POST', credentials: 'include', body: form });
      const text = await res.text();
      const data: unknown = text ? safeJson(text) : null;
      if (!res.ok)
        throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? res.statusText, data);
      return data as T;
    }
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}${path}`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('accept', 'application/json');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onerror = () => reject(new TypeError('Network request failed'));
      xhr.onload = () => {
        const data: unknown = xhr.responseText ? safeJson(xhr.responseText) : null;
        if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
        else
          reject(
            new ApiError(xhr.status, (data as { error?: string } | null)?.error ?? xhr.statusText, data),
          );
      };
      xhr.send(form);
    });
  }
  return {
    baseUrl: base,
    upload,
    get: <T>(path: string, init?: RequestInit) => request<T>('GET', path, undefined, init),
    post: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>('POST', path, body, init),
    patch: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>('PATCH', path, body, init),
    put: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>('PUT', path, body, init),
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
