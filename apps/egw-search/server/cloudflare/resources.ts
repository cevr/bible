/**
 * The search's data on Cloudflare: the corpus in D1, the vectors in
 * Vectorize, and the weekly sync's reports in R2.
 *
 * Both were created and loaded once, outside the stack, from the same
 * `egw-paragraphs.db` and `vectors.bvi` the Bun server reads: a 3 GB import
 * and a 3 M-vector upload are a migration, not something a deploy repeats.
 * The stack adopts them and retains them, so no stage creates a second copy
 * and no `destroy` removes the corpus. Every stage reads the same data.
 *
 * Each prop matches what exists. A Vectorize index cannot change its
 * dimensions, metric or description in place; a different value here would
 * replace the index and lose every vector in it.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';

/** The four properties the vector leg filters on (`./vectorize.ts`). */
const FILTERED_PROPERTIES = ['book', 'section', 'type', 'subtype'] as const;

const shared = <A, R>(resource: Effect.Effect<A, never, R>) =>
  resource.pipe(Alchemy.AdoptPolicy.adopt(true), Alchemy.RemovalPolicy.retain());

/** `egw-paragraphs.db` without its FTS shadow tables, which D1 builds itself.
 *
 *  Its primary is in `enam`. That is not stated here: a location hint that
 *  ever differs from the recorded one replaces a named database by deleting
 *  it first (`D1/Database.ts`, `diff`), and the name alone finds it. */
export const Corpus = Cloudflare.D1.Database('Corpus', { name: 'egw-corpus' }).pipe(shared);

/** `vectors.bvi`: EmbeddingGemma's first 256 dimensions, int8, by paragraph. */
export const Vectors = Cloudflare.Vectorize.Index('Vectors', {
  name: 'egw-paragraphs',
  dimensions: 256,
  metric: 'cosine',
  description: 'EGW paragraphs, embeddinggemma-300m first 256 dims',
}).pipe(shared);

/** A metadata index per filtered property: Vectorize filters only on these. */
export const VectorFilters = Effect.forEach(FILTERED_PROPERTIES, (property) =>
  Cloudflare.Vectorize.MetadataIndex(`VectorFilter-${property}`, {
    indexName: 'egw-paragraphs',
    propertyName: property,
    indexType: 'string',
  }).pipe(shared),
);

/** The weekly sync's reports, a Markdown file a run (`./sync-report.ts`).
 *  Written by the sync's Worker on `prod`, read by the search's page for them
 *  (`./sync-pages.ts`), and shared by every stage like the corpus, so a
 *  preview shows the reports `prod` wrote and a `destroy` keeps them. */
export const SyncReports = Cloudflare.R2.Bucket('SyncReports', { name: 'egw-sync-reports' }).pipe(
  shared,
);
