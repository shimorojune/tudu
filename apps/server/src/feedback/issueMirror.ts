import {
  embeddingText,
  issueBodyText,
  SIMILAR_FLOOR,
  SIMILAR_LIMIT,
  SIMILAR_QUERY_MAX,
  type SimilarIssue,
} from '@tudu/core';
import { and, asc, count, cosineDistance, eq, inArray, isNotNull, isNull, schema, sql, type Db } from '@tudu/db';
import type { Embeddings } from '../closeMatches';
import type { IssueTracker, ListedIssue } from './github';

/** The mirror catches up with GitHub this often (and once on boot). */
export const MIRROR_EVERY_MS = 10 * 60 * 1000;
/** Issues embedded in one go. */
export const MIRROR_EMBED_BATCH = 24;

/** The similar search can't answer: the model is off, or the issues haven't been read from GitHub yet. */
export class SimilarUnavailable extends Error {
  constructor() {
    super('Close matches aren’t available right now.');
  }
}

/**
 * The public GitHub issues, kept in `github_issues` (#76) so the feedback form can offer ones that mean what is
 * being typed. A sync reads what changed since the newest change it holds; an issue the app files goes in at once,
 * so a duplicate sent a minute later is found. A change to an issue's words drops its vector until the next batch.
 */
export class IssueMirror {
  /** A sync has finished, or the table already held issues when the server started. */
  private ready = false;
  private running: Promise<number> | null = null;

  constructor(
    private readonly db: Db,
    private readonly tracker: IssueTracker,
    /** Where vectors come from; without it nothing is embedded and the search answers SimilarUnavailable. */
    readonly embeddings: Embeddings | null = null,
    private readonly options: { quiet?: boolean } = {},
  ) {}

  /** Whether the search can trust an empty answer to mean "nothing similar". */
  async synced(): Promise<boolean> {
    if (this.ready) return true;
    const [row] = await this.db.select({ n: count() }).from(schema.githubIssues);
    if ((row?.n ?? 0) > 0) this.ready = true;
    return this.ready;
  }

  /** Read what changed on GitHub and keep it; returns how many issues were written. One sync at a time. */
  sync(): Promise<number> {
    if (this.running) return this.running;
    this.running = (async () => {
      const [newest] = await this.db
        .select({ at: sql<Date | null>`max(${schema.githubIssues.updatedAt})` })
        .from(schema.githubIssues);
      const since = newest?.at ? new Date(newest.at) : null;
      const issues = await this.tracker.list(since);
      for (const issue of issues) await this.keep(issue);
      this.ready = true;
      return issues.length;
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Sync, then embed what came in. */
  async refresh(): Promise<void> {
    await this.sync();
    if (this.embeddings) await this.embedAll(this.embeddings);
  }

  /** Refresh soon, without waiting; a failure is logged and the next tick tries again. */
  kick(): void {
    void this.refresh().catch((err) => {
      if (!this.options.quiet) console.error('feedback: reading GitHub issues failed', err);
    });
  }

  /**
   * An issue the app just filed, in the mirror at once. Its change time is the epoch, so the next sync's starting
   * point never jumps past changes it hasn't read; that sync then writes GitHub's own times over it.
   */
  async filed(issue: { number: number; url: string }, title: string, body: string): Promise<void> {
    const now = new Date();
    await this.keep(
      {
        number: issue.number,
        title,
        body,
        state: 'open',
        stateReason: null,
        locked: false,
        url: issue.url,
        createdAt: now,
        closedAt: null,
        updatedAt: new Date(0),
      },
      { keepNewer: true },
    );
    if (this.embeddings)
      void this.embedAll(this.embeddings).catch((err) => {
        if (!this.options.quiet) console.error('feedback: embedding a filed issue failed', err);
      });
  }

  private async keep(issue: ListedIssue, opts: { keepNewer?: boolean } = {}): Promise<void> {
    const bodyText = issueBodyText(issue.body);
    const words = embeddingText(issue.title, bodyText);
    const t = schema.githubIssues;
    const values = {
      number: issue.number,
      title: issue.title,
      bodyText,
      state: issue.state,
      stateReason: issue.stateReason,
      locked: issue.locked,
      url: issue.url,
      createdAt: issue.createdAt,
      closedAt: issue.closedAt,
      updatedAt: issue.updatedAt,
    };
    const q = this.db.insert(t).values(values);
    if (opts.keepNewer) {
      await q.onConflictDoNothing();
      return;
    }
    await q.onConflictDoUpdate({
      target: t.number,
      set: {
        title: values.title,
        bodyText: values.bodyText,
        state: values.state,
        stateReason: values.stateReason,
        locked: values.locked,
        url: values.url,
        createdAt: values.createdAt,
        closedAt: values.closedAt,
        updatedAt: values.updatedAt,
        // Same words, same vector; new words wait for the next batch.
        embedding: sql`case when ${t.embeddedText} = ${words} then ${t.embedding} else null end`,
        embeddedText: sql`case when ${t.embeddedText} = ${words} then ${t.embeddedText} else null end`,
      },
    });
  }

  /** One batch of issues without a vector; returns how many it did. */
  async embedStep(embeddings: Embeddings, limit = MIRROR_EMBED_BATCH): Promise<number> {
    const embedder = embeddings.embedder;
    if (!embedder) return 0;
    const t = schema.githubIssues;
    const rows = await this.db
      .select({ number: t.number, title: t.title, bodyText: t.bodyText })
      .from(t)
      .where(isNull(t.embedding))
      .orderBy(asc(t.number))
      .limit(limit);
    if (!rows.length) return 0;
    const texts = rows.map((r) => embeddingText(r.title, r.bodyText));
    const vectors = await embedder.embed(texts);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      await this.db
        .update(t)
        .set({ embedding: vectors[i]!, embeddedText: texts[i]! })
        .where(and(eq(t.number, r.number), eq(t.title, r.title), eq(t.bodyText, r.bodyText)));
    }
    return rows.length;
  }

  /** Embed every issue without a vector. */
  async embedAll(embeddings: Embeddings): Promise<number> {
    let total = 0;
    for (let n = await this.embedStep(embeddings); n > 0; n = await this.embedStep(embeddings)) total += n;
    return total;
  }

  /** Whether an issue can take a +1 now, as far as the mirror knows: there, and not locked. */
  async canTakePlusOne(number: number): Promise<boolean> {
    const [row] = await this.db
      .select({ locked: schema.githubIssues.locked })
      .from(schema.githubIssues)
      .where(eq(schema.githubIssues.number, number));
    return !!row && !row.locked;
  }

  /** An issue's title as the mirror has it. */
  async titleOf(numbers: number[]): Promise<Map<number, string>> {
    if (!numbers.length) return new Map();
    const rows = await this.db
      .select({ number: schema.githubIssues.number, title: schema.githubIssues.title })
      .from(schema.githubIssues)
      .where(inArray(schema.githubIssues.number, numbers));
    return new Map(rows.map((r) => [r.number, r.title]));
  }
}

/** What GitHub's state and reason read as in the form: open, fixed (done), or closed (not planned, a duplicate). */
export function similarState(state: string, reason: string | null): SimilarIssue['state'] {
  if (state === 'open') return 'open';
  return reason === 'completed' || reason === null ? 'fixed' : 'closed';
}

/**
 * Issues that mean what was typed, closest first: the nearest vectors among issues that aren't locked, above the
 * floor, at most three. Throws SimilarUnavailable when the model is off or the mirror has never synced, so an empty
 * answer always means "nothing similar".
 */
export async function searchSimilarIssues(
  db: Db,
  embeddings: Embeddings,
  mirror: IssueMirror,
  userId: string,
  q: string,
  floor = SIMILAR_FLOOR,
): Promise<SimilarIssue[]> {
  const words = q.trim().slice(0, SIMILAR_QUERY_MAX);
  if (!words) return [];
  if (!(await mirror.synced())) throw new SimilarUnavailable();
  let vector: number[];
  try {
    vector = await embeddings.query(words, userId);
  } catch {
    throw new SimilarUnavailable();
  }
  const t = schema.githubIssues;
  const distance = cosineDistance(t.embedding, vector);
  const plusOnes = sql<number>`(select count(*)::int from ${schema.feedback} where ${schema.feedback.plusOneOf} = ${t.number})`;
  const rows = await db
    .select({
      number: t.number,
      title: t.title,
      url: t.url,
      state: t.state,
      stateReason: t.stateReason,
      createdAt: t.createdAt,
      closedAt: t.closedAt,
      distance,
      plusOnes,
    })
    .from(t)
    .where(and(isNotNull(t.embedding), eq(t.locked, false)))
    .orderBy(asc(distance), asc(t.number))
    .limit(SIMILAR_LIMIT);
  return rows
    .filter((r) => 1 - Number(r.distance) >= floor)
    .map((r) => ({
      number: r.number,
      title: r.title,
      url: r.url,
      state: similarState(r.state, r.stateReason),
      createdAt: r.createdAt.toISOString(),
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      plusOnes: Number(r.plusOnes),
    }));
}
