/** The vector leg's one question, as a service: which paragraphs lie nearest a
 *  query vector, inside the books a search may reach.
 *
 *  The search service used to answer it itself, by scanning the flat `.bvi`
 *  buffer it held in memory. That buffer is 246 MB, and a host with less memory
 *  than that — a Cloudflare Worker has 128 MB — cannot hold it at all, while an
 *  approximate index such as Vectorize answers the same question without
 *  holding anything. So the question is the seam: the service embeds, checks
 *  the fingerprint and fuses, and a `VectorNeighbors` answers it.
 *
 *  **The scope travels as the search's own filter, not as a list of books.** A
 *  flat scan narrows by skipping whole book ranges, so it wants the set of book
 *  codes the filter admits. An index with metadata filtering wants the filter
 *  itself: the set is hundreds of codes for a broad filter, far past what a
 *  metadata query can carry, while the filter is a handful of classifications
 *  stored on every vector. Each source turns the filter into what it can use.
 */

import { Context, Schema } from 'effect';
import type { Effect, Option } from 'effect';

import type { CorpusFilter } from '../writings/corpus-class.js';
import type { VectorIndexUnavailable } from './model.js';

/** Which paragraphs one vector query may return, and how many. */
export interface NeighborScope {
  readonly topK: number;
  /** One book, when the reader narrowed to one. It wins over `filter`. */
  readonly bookCode: Option.Option<string>;
  readonly filter: CorpusFilter;
}

/** One query's answer. */
interface Neighbors {
  /** Paragraph identities (`paragraphIdentity`), nearest first. */
  readonly ids: readonly string[];
  /** How many vectors the source considered. A flat scan counts the vectors in
   *  the ranges it walked; an approximate index cannot know, and reports how
   *  many candidates it returned. */
  readonly scanned: number;
  /** Which engine answered (`js`, a SIMD tier, `vectorize`), for the timing log. */
  readonly engine: string;
}

/** Whether this host has vectors to search, decided once when the source was built. */
type VectorNeighborsState =
  | { readonly _tag: 'ready'; readonly fingerprint: string }
  | { readonly _tag: 'unavailable'; readonly absence: VectorIndexUnavailable };

/** The source could not answer this query (a network fault, a refused request).
 *
 *  A typed failure the vector leg degrades on, the same way it degrades on an
 *  embedder that declines: the lexical leg's answer still stands. */
class VectorNeighborsUnavailable extends Schema.TaggedError<VectorNeighborsUnavailable>()(
  'Search/VectorNeighborsUnavailable',
  {
    engine: Schema.String,
    reason: Schema.String,
  },
) {}

export interface VectorNeighborsApi {
  readonly state: VectorNeighborsState;
  readonly nearest: (
    vector: Int8Array,
    scope: NeighborScope,
  ) => Effect.Effect<Neighbors, VectorNeighborsUnavailable>;
}

export class VectorNeighbors extends Context.Service<VectorNeighbors, VectorNeighborsApi>()(
  '@bible/core/search/VectorNeighbors',
) {}
