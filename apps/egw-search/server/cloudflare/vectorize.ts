/**
 * The vector leg's neighbors, answered by Vectorize.
 *
 * A Worker has 128 MB and cannot hold the 246 MB flat index, so the vectors
 * live in a Vectorize index instead: the same int8 vectors `vectors.bvi`
 * holds, under the same paragraph identities (`bookCode:para_id`), each with
 * its book's code and classification as metadata.
 *
 * **The filter is pushed into the query.** The flat scan narrows by skipping
 * whole books; Vectorize narrows by metadata, so the search's filter becomes a
 * metadata filter over the four indexed properties. The two must admit the
 * same books, because the vector leg returns at most `MAX_TOP_K` neighbors and
 * a filter applied afterwards would leave a narrowed search with none. The
 * search still filters the bodies it joins (`vectorOnlyBodies`), so a filter
 * this module gets wrong costs recall, never correctness.
 */

import { Array as Arr, Effect, Option } from 'effect';

import {
  type NeighborScope,
  type VectorNeighborsApi,
  VectorNeighborsUnavailable,
} from '@bible/core/search';
import {
  APPARATUS_TYPES,
  EXCLUDED_SUBTYPES,
  isBookSubtype,
  isBookType,
  isCorpusSection,
} from '@bible/core/writings';

/** The metadata value a vector carries where its book has no classification,
 *  or one outside the search's vocabulary (`no pagebreaks`). An include
 *  never names it and an exclude never removes it, which is how the SQL treats
 *  an unclassified book. */
export const UNCLASSIFIED = 'none';

/** A book's classification as the metadata its vectors carry: the four
 *  properties the filter reads (`FILTERED_PROPERTIES` in `./resources.ts`),
 *  each `UNCLASSIFIED` where the book has none the search knows. */
export const vectorMetadata = (book: {
  readonly code: string;
  readonly section: Option.Option<string>;
  readonly type: Option.Option<string>;
  readonly subtype: Option.Option<string>;
}) => {
  const known = (value: Option.Option<string>, is: (value: string) => boolean) =>
    Option.getOrElse(Option.filter(value, is), () => UNCLASSIFIED);
  return {
    book: book.code,
    section: known(book.section, isCorpusSection),
    type: known(book.type, isBookType),
    subtype: known(book.subtype, isBookSubtype),
  };
};

/** The most neighbors Vectorize returns for a query that asks for values.
 *
 *  Asking for values is what makes Vectorize score its candidates exactly.
 *  Without them it ranks by approximate scores, and against the flat scan's
 *  exact neighbors that ordering held 1 to 6 of the true top 10 over six
 *  measured queries; rescored, it held 7 to 10. The fusion weighs a
 *  neighbor by its rank, so a precise top 50 is worth more than an
 *  approximate top 100 (the cap without values). */
export const MAX_TOP_K = 50;

/** A value no vector carries: what an include list emptied by its own
 *  excludes matches, which is nothing. */
const NOTHING = '(none of these)';

type Clause = { readonly $eq: string } | { readonly $in: string[] } | { readonly $nin: string[] };

/** A Vectorize metadata filter: every clause must hold. */
export type MetadataFilter = Record<string, Clause>;

/** One classification axis as a clause, or nothing when it narrows nothing. */
const axis = (include: readonly string[], exclude: ReadonlySet<string>): Option.Option<Clause> => {
  const admitted = include.filter((value) => !exclude.has(value));
  if (include.length > 0 && admitted.length === 0) return Option.some({ $eq: NOTHING });
  if (include.length > 0) return Option.some({ $in: admitted });
  if (exclude.size > 0) return Option.some({ $nin: [...exclude] });
  return Option.none();
};

const union = (left: readonly string[], right: Iterable<string>): ReadonlySet<string> =>
  new Set([...left, ...right]);

/** The search's scope as the metadata filter that admits the same books.
 *
 *  A book wins outright, as it does for the flat scan. Otherwise each axis
 *  applies its signed selection; the corpus-level subtype exclusion always
 *  holds, and `excludeApparatus` adds the apparatus types to the type axis. */
export const vectorizeFilter = (scope: NeighborScope) => {
  if (Option.isSome(scope.bookCode)) {
    return { book: { $eq: scope.bookCode.value } } satisfies MetadataFilter;
  }
  const filter = scope.filter;
  const apparatus = [...APPARATUS_TYPES].filter(() => filter.excludeApparatus);
  const clauses: ReadonlyArray<readonly [string, Option.Option<Clause>]> = [
    ['section', axis(filter.section.include, new Set(filter.section.exclude))],
    ['type', axis(filter.type.include, union(filter.type.exclude, apparatus))],
    ['subtype', axis(filter.subtype.include, union(filter.subtype.exclude, EXCLUDED_SUBTYPES))],
  ];
  return Object.fromEntries(
    Arr.flatMap(clauses, ([name, clause]) =>
      Option.match(clause, { onNone: () => [], onSome: (value) => [[name, value] as const] }),
    ),
  ) satisfies MetadataFilter;
};

/** The part of the Vectorize binding the vector leg uses. */
export interface VectorizeQuery {
  readonly query: (
    vector: number[],
    options: {
      topK: number;
      filter: MetadataFilter;
      returnValues: true;
      returnMetadata: 'none';
    },
  ) => Promise<{ readonly matches: ReadonlyArray<{ readonly id: string }> }>;
}

/** A Vectorize index as the vector leg's source.
 *
 *  `fingerprint` is the model the uploaded vectors were embedded under: the
 *  index holds no record of it, so the deploy states it, and the search
 *  compares it with the embedder's as it does for a `.bvi` file.
 *
 *  The query vector goes up as its int8 components, as the stored vectors
 *  did. Cosine ignores the query's scale, so the rescored order differs from
 *  the flat scan's int8 dot product only by the small spread in the stored
 *  vectors' lengths, and by the candidates the approximate search missed. */
export const vectorizeNeighbors = (
  index: VectorizeQuery,
  fingerprint: string,
): VectorNeighborsApi => ({
  state: { _tag: 'ready', fingerprint },
  nearest: (vector, scope) =>
    Effect.tryPromise({
      try: () =>
        index.query(Array.from(vector), {
          topK: Math.min(scope.topK, MAX_TOP_K),
          filter: vectorizeFilter(scope),
          returnValues: true,
          returnMetadata: 'none',
        }),
      catch: (cause) =>
        VectorNeighborsUnavailable.make({ engine: 'vectorize', reason: String(cause) }),
    }).pipe(
      Effect.map((answer) => ({
        ids: answer.matches.map((match) => match.id),
        // An approximate index cannot say how many vectors it considered;
        // what it returned is the honest count.
        scanned: answer.matches.length,
        engine: 'vectorize',
      })),
    ),
});
