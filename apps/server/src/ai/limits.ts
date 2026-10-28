/**
 * Counting calls in fixed windows, in memory: one API process serves Tudu, and a restart forgiving a burst is fine.
 * Better Auth's own limiter only runs in production, so tests couldn't see these.
 */
export class Limiter {
  private hits = new Map<string, { start: number; n: number }>();

  constructor(
    readonly max: number,
    readonly windowMs: number,
    private now: () => number = Date.now,
  ) {}

  /** Counts one for `key`; null when it may go ahead, else the seconds until it may. */
  take(key: string): number | null {
    const t = this.now();
    const w = this.hits.get(key);
    if (!w || t - w.start >= this.windowMs) {
      this.hits.set(key, { start: t, n: 1 });
      if (this.hits.size > 10_000) this.sweep(t);
      return null;
    }
    if (w.n >= this.max) return Math.max(1, Math.ceil((w.start + this.windowMs - t) / 1000));
    w.n++;
    return null;
  }

  private sweep(t: number) {
    for (const [k, w] of this.hits) if (t - w.start >= this.windowMs) this.hits.delete(k);
  }
}

/** Calls a minute, per key or app. */
export const CALLS_PER_MINUTE = 120;
/** Apps registering themselves (DCR), an hour, per address. */
export const REGISTERS_PER_HOUR = 10;
