/**
 * The live stream. Each signed-in person has a channel; the server publishes small typed events on it
 * (a task changed, a comment arrived, a new version is ready) and every open tab of theirs invalidates
 * what it shows. Events are numbered per person and the last 200 are kept, so a reconnect with
 * Last-Event-ID gets what it missed.
 */
export interface Published {
  id: number;
  type: string;
  data: unknown;
}

type Listener = (e: Published) => void;

export class EventHub {
  private seq = new Map<string, number>();
  private recent = new Map<string, Published[]>();
  private listeners = new Map<string, Set<Listener>>();
  private readonly keep = 200;

  publish(userId: string, type: string, data: unknown = null): Published {
    const id = (this.seq.get(userId) ?? 0) + 1;
    this.seq.set(userId, id);
    const e: Published = { id, type, data };
    const list = this.recent.get(userId) ?? [];
    list.push(e);
    if (list.length > this.keep) list.splice(0, list.length - this.keep);
    this.recent.set(userId, list);
    this.listeners.get(userId)?.forEach((l) => l(e));
    return e;
  }

  /** Events after `afterId` that are still remembered. */
  since(userId: string, afterId: number): Published[] {
    return (this.recent.get(userId) ?? []).filter((e) => e.id > afterId);
  }

  subscribe(userId: string, listener: Listener): () => void {
    const set = this.listeners.get(userId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(userId, set);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(userId);
    };
  }

  /** How many connections a person has open (tests). */
  connections(userId: string): number {
    return this.listeners.get(userId)?.size ?? 0;
  }
}
