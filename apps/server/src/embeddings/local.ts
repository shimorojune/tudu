import { EMBEDDING_DIMENSIONS } from '@tudu/db/schema';
import type { Embedder } from './index';

/** The model inside the API: all-MiniLM-L6-v2, quantised, 384 numbers per text, run on the CPU. */
export const LOCAL_MODEL = 'Xenova/all-MiniLM-L6-v2';

type Pipeline = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ dims: number[]; data: Float32Array }>;

/**
 * Embeds with Transformers.js (ONNX on the CPU). The model loads once, on first use, from `modelDir`; with
 * `offline` it is never downloaded, so a production image must carry it. Calls are run one after another: the
 * runtime is not safe to share, and a batch is cheaper than its parts.
 */
export class LocalEmbedder implements Embedder {
  readonly name = LOCAL_MODEL;
  readonly dims = EMBEDDING_DIMENSIONS;
  private loading: Promise<Pipeline> | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: { modelDir?: string; offline?: boolean; quiet?: boolean } = {}) {}

  /** Load the model now rather than on the first search (the API does this at start). */
  warm(): Promise<void> {
    return this.pipeline().then(() => undefined);
  }

  private pipeline(): Promise<Pipeline> {
    if (!this.loading) {
      this.loading = (async () => {
        const started = Date.now();
        const tf = await import('@huggingface/transformers');
        if (this.options.modelDir) tf.env.cacheDir = this.options.modelDir;
        tf.env.allowRemoteModels = !this.options.offline;
        const p = (await tf.pipeline('feature-extraction', LOCAL_MODEL, {
          dtype: 'q8',
        })) as unknown as Pipeline;
        if (!this.options.quiet) console.log(`embeddings: ${LOCAL_MODEL} ready in ${Date.now() - started}ms`);
        return p;
      })();
      this.loading.catch(() => {
        // A failed load is tried again on the next call (the files may arrive, the network may come back).
        this.loading = null;
      });
    }
    return this.loading;
  }

  embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return Promise.resolve([]);
    const run = this.chain.then(async () => {
      const p = await this.pipeline();
      const out = await p(texts, { pooling: 'mean', normalize: true });
      const d = out.dims[1]!;
      const rows: number[][] = [];
      for (let i = 0; i < texts.length; i++) rows.push(Array.from(out.data.subarray(i * d, (i + 1) * d)));
      return rows;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}
