/**
 * What a task means, as numbers (chunk 13). One interface, so the model can run inside the API (local) or, if the
 * accuracy gate ever fails, at a hosted service, with nothing else changing.
 */
export interface Embedder {
  /** The model's name, for logs and the kit. */
  readonly name: string;
  /** How many numbers each text becomes; the column's width. */
  readonly dims: number;
  /** One unit vector per text, in order. The same text always gives the same vector. */
  embed(texts: string[]): Promise<number[][]>;
}

export { embeddingText } from '@tudu/core';
export { FakeEmbedder } from './fake';
export { LocalEmbedder, LOCAL_MODEL } from './local';
export { localModelDir } from './modelDir';
