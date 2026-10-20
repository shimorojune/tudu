/**
 * The live stream: server-sent events for the signed-in person. Reconnects with backoff and resumes from the
 * last event id it saw, so nothing is missed while the laptop sleeps.
 */
export interface LiveEvent {
  id: string;
  type: string;
  data: unknown;
}

export interface EventsOptions {
  url: string;
  onEvent: (event: LiveEvent) => void;
  onStatus?: (status: 'connecting' | 'open' | 'closed') => void;
  /** For tests: a different EventSource. */
  EventSource?: typeof EventSource;
  /** Backoff limits in ms. */
  minDelay?: number;
  maxDelay?: number;
}

export interface EventsHandle {
  close: () => void;
  /** The id of the last event received, sent back as Last-Event-ID on reconnect. */
  lastId: () => string | null;
}

export function connectEvents(options: EventsOptions): EventsHandle {
  const ES = options.EventSource ?? globalThis.EventSource;
  const min = options.minDelay ?? 1000;
  const max = options.maxDelay ?? 30_000;
  let delay = min;
  let lastId: string | null = null;
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function open() {
    if (closed) return;
    options.onStatus?.('connecting');
    const u = new URL(options.url, typeof location !== 'undefined' ? location.href : 'http://localhost');
    if (lastId) u.searchParams.set('lastEventId', lastId);
    es = new ES(u.toString(), { withCredentials: true });
    es.onopen = () => {
      delay = min;
      options.onStatus?.('open');
    };
    es.onmessage = (m: MessageEvent<string>) => {
      if (m.lastEventId) lastId = m.lastEventId;
      let data: unknown = m.data;
      try {
        data = JSON.parse(m.data);
      } catch {
        /* a plain line */
      }
      const typed = data as { type?: string; data?: unknown };
      options.onEvent({ id: m.lastEventId, type: typed?.type ?? 'message', data: typed?.data ?? data });
    };
    es.onerror = () => {
      es?.close();
      es = null;
      options.onStatus?.('closed');
      if (closed) return;
      timer = setTimeout(open, delay);
      delay = Math.min(max, delay * 2);
    };
  }
  open();
  return {
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      es?.close();
      es = null;
      options.onStatus?.('closed');
    },
    lastId: () => lastId,
  };
}
