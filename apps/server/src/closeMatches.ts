import { closeMatches, embeddingText, MEANING_FLOOR, MEANING_LIMIT, type SearchHit } from '@tudu/core';
import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  schema,
  sql,
  type Db,
} from '@tudu/db';
import type { Embedder } from './embeddings';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

/** How many tasks are embedded in one go. */
export const EMBED_BATCH = 24;
/** Anything a batch missed, and the backfill, is picked up this often. */
export const EMBED_EVERY_MS = 60_000;

/** The meaning search is not available (the model is off, or the test switch is down). */
export class MeaningUnavailable extends Error {
  constructor() {
    super('Close matches aren’t available right now.');
  }
}

/**
 * The tasks a person may read, in any space: their own, a task whose owner has left (it belongs to everyone in
 * the space), or another member's task shared with the space; only in spaces they are in, never deleted. Every
 * search, by word or by meaning, reads through this and nothing else.
 */
export function readableBy(userId: string) {
  return and(
    isNull(schema.tasks.deletedAt),
    inArray(
      schema.tasks.spaceId,
      sql`(select ${schema.spaceMembers.spaceId} from ${schema.spaceMembers} where ${schema.spaceMembers.userId} = ${userId})`,
    ),
    or(eq(schema.tasks.ownerId, userId), isNull(schema.tasks.ownerId), eq(schema.tasks.visibility, 'space')),
  )!;
}

const hitColumns = {
  id: schema.tasks.id,
  spaceId: schema.tasks.spaceId,
  number: schema.tasks.number,
  prefix: schema.spaces.taskPrefix,
  title: schema.tasks.title,
  day: schema.tasks.day,
  doneAt: schema.tasks.doneAt,
  projectId: schema.tasks.projectId,
  jiraKey: schema.tasks.jiraKey,
};

/**
 * Keeps every task's vector in step with its words (chunk 13). A sync batch kicks it after the response; a tick
 * picks up anything missed and the backfill of rows that never had one. Work runs one batch at a time.
 */
export class Embeddings {
  /** The test switch: down, the meaning search fails as it would with the model gone. */
  down = false;
  /** The same, for one person at a time (end-to-end tests run side by side on one API). */
  readonly downFor = new Set<string>();
  private running: Promise<number> | null = null;
  private again = false;

  constructor(
    private readonly db: Db,
    readonly embedder: Embedder | null,
    private readonly options: { batch?: number; quiet?: boolean } = {},
  ) {}

  get on(): boolean {
    return this.embedder !== null;
  }

  /** Embed what is pending, soon, without waiting for it. */
  kick(): void {
    void this.drain().catch((err) => {
      if (!this.options.quiet) console.error('embeddings: a batch failed', err);
    });
  }

  /** Embed everything pending and return how many tasks were done. A call during a run makes it run once more. */
  drain(): Promise<number> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      let total = 0;
      do {
        this.again = false;
        let n: number;
        do {
          n = await this.step();
          total += n;
        } while (n > 0);
      } while (this.again);
      return total;
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** One batch: the newest tasks without a vector. Returns how many it did; zero means nothing is pending. */
  async step(limit = this.options.batch ?? EMBED_BATCH): Promise<number> {
    if (!this.embedder) return 0;
    const rows = await this.db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        notesText: schema.tasks.notesText,
      })
      .from(schema.tasks)
      .where(and(isNull(schema.tasks.embedding), isNull(schema.tasks.deletedAt)))
      .orderBy(desc(schema.tasks.updatedAt))
      .limit(limit);
    if (!rows.length) return 0;
    const texts = rows.map((r) => embeddingText(r.title, r.notesText));
    const vectors = await this.embedder.embed(texts);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      // Only if the words are still the ones embedded: a write in between nulled the vector again, and the next
      // batch sees it.
      await this.db
        .update(schema.tasks)
        .set({ embedding: vectors[i]!, embeddedText: texts[i]! })
        .where(
          and(
            eq(schema.tasks.id, r.id),
            eq(schema.tasks.title, r.title),
            eq(schema.tasks.notesText, r.notesText),
          ),
        );
    }
    return rows.length;
  }

  /** The vector for words someone typed. */
  async query(text: string, userId?: string): Promise<number[]> {
    if (!this.embedder || this.down || (userId !== undefined && this.downFor.has(userId)))
      throw new MeaningUnavailable();
    const [v] = await this.embedder.embed([embeddingText(text, '')]);
    return v!;
  }
}

export interface MeaningOptions {
  /** Only this space (Quick Add); every space you are in when left out (Search). */
  spaceId?: string;
  /** Tasks the caller already lists, left out. */
  exclude?: string[];
  openOnly?: boolean;
  limit?: number;
  floor?: number;
}

/**
 * Tasks that mean what was typed, closest first: the nearest vectors among the tasks you may read (the rule is in
 * the query, so the four nearest are the four nearest you may read), above the floor, without the excluded ones.
 */
export async function searchByMeaning(
  db: Executor,
  embeddings: Embeddings,
  userId: string,
  q: string,
  options: MeaningOptions = {},
): Promise<Array<SearchHit & { similarity: number }>> {
  const words = q.trim();
  if (!words) return [];
  const limit = options.limit ?? MEANING_LIMIT;
  const vector = await embeddings.query(words, userId);
  const distance = cosineDistance(schema.tasks.embedding, vector);
  const exclude = (options.exclude ?? []).filter(Boolean).slice(0, 60);
  const rows = await db
    .select({ ...hitColumns, distance })
    .from(schema.tasks)
    .innerJoin(schema.spaces, eq(schema.spaces.id, schema.tasks.spaceId))
    .where(
      and(
        readableBy(userId),
        isNotNull(schema.tasks.embedding),
        options.spaceId ? eq(schema.tasks.spaceId, options.spaceId) : undefined,
        options.openOnly ? isNull(schema.tasks.doneAt) : undefined,
        exclude.length ? notInArray(schema.tasks.id, exclude) : undefined,
      ),
    )
    .orderBy(asc(distance), asc(schema.tasks.createdAt))
    .limit(limit);
  const found = rows.map((r) => ({
    item: {
      id: r.id,
      spaceId: r.spaceId,
      ref: `${r.prefix}-${r.number}`,
      title: r.title,
      day: r.day,
      done: r.doneAt !== null,
      projectId: r.projectId,
      jira: r.jiraKey,
      snippet: null,
    } satisfies SearchHit,
    similarity: 1 - Number(r.distance),
  }));
  return closeMatches(found, [], limit, options.floor ?? MEANING_FLOOR).map((m) => ({
    ...m.item,
    similarity: m.similarity,
  }));
}
