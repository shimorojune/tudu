import { EMBEDDING_DIMENSIONS } from '@tudu/db/schema';
import type { Embedder } from './index';

/**
 * A stand-in for unit tests: a vector made from the words, so texts that share words sit close and the same text
 * always gives the same vector. It knows nothing of meaning; the real model's accuracy has its own test.
 */
export class FakeEmbedder implements Embedder {
  readonly name = 'fake';
  readonly dims = EMBEDDING_DIMENSIONS;
  /** Every text it was asked for, in order, for tests that check what was embedded. */
  readonly seen: string[] = [];

  async embed(texts: string[]): Promise<number[][]> {
    this.seen.push(...texts);
    return texts.map((t) => {
      const v = new Array<number>(this.dims).fill(0);
      for (const w of t
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)) {
        let h = 2166136261;
        for (const ch of w) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
        for (let k = 0; k < 4; k++) {
          const at = (h >>> (k * 8)) % this.dims;
          v[at] = (v[at] ?? 0) + 1;
        }
      }
      const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / n);
    });
  }
}
