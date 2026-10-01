/** §9.5's embedding adapter contract: one `Context.Service`, one fingerprint,
 *  no implementation in core.
 *
 *  An embedder must produce a vector this build can dot against the installed
 *  index. What makes that checkable rather than hoped for is that the adapter
 *  *declares its fingerprint*, and the search service compares that declaration
 *  against the index's before using a single vector from it.
 *
 *  **The portable module has no implementation.** An embedder needs an ONNX
 *  runtime, a host binary; the Bun adapter (`embedder-bun.ts`) supplies it and
 *  tests supply fixtures. What lives here is the shape they satisfy.
 */

import { Context, Schema } from 'effect';
import type { Effect } from 'effect';

/** Why this host cannot embed a query right now (§9.6's `embedder` absence).
 *
 *  A typed failure rather than a defect, because every one of these is a *state*
 *  a client renders rather than a bug it crashes on: an install whose model
 *  files were never downloaded, a model that loaded but produced the wrong
 *  shape. Search degrades to lexical-only with the typed absence, which
 *  requires the embedder to be able to say no.
 */
export class QueryEmbedderUnavailable extends Schema.TaggedError<QueryEmbedderUnavailable>()(
  'Search/QueryEmbedderUnavailable',
  {
    /** Which adapter declined, for an operator reading a log. */
    adapter: Schema.String,
    reason: Schema.String,
  },
) {}

export interface QueryEmbedderApi {
  /** The model fingerprint this adapter produces vectors under (§9.5).
   *
   *  Carried on the service rather than assumed to be `MODEL_FINGERPRINT`,
   *  because that assumption is exactly what §10's mismatch test exists to
   *  break: an adapter pointed at a different model must be *detectable*, and
   *  it can only be detected if it reports what it actually loaded.
   */
  readonly fingerprint: string;
  /** One **query**, as the int8 vector the flat index is scanned with.
   *
   *  Already quantized, because the quantization scheme is part of the format
   *  and `quantize` in `vector-index.ts` is its one definition — an adapter
   *  returning floats would make each caller responsible for applying it, and
   *  the scale factor could be spelled more than one way.
   *
   *  Separate from `embedDocument` because EmbeddingGemma is an *asymmetric*
   *  retrieval model: it is trained with a task prefix on each side, and the
   *  two prefixes are different strings. Embedding a document through the query
   *  method produces a vector in the query's region of the space, so every
   *  document sits closer to every query than it should and the ranking
   *  degrades to noise — with no error anywhere. One method with a boolean
   *  would let a caller forget; two methods make the choice unavoidable.
   */
  readonly embedQuery: (query: string) => Effect.Effect<Int8Array, QueryEmbedderUnavailable>;
  /** One **document** (a corpus paragraph), under the document-side prefix.
   *
   *  Used by the index builder and by nothing at query time. It lives on the
   *  same service as `embedQuery` so both sides of the index are produced by
   *  one loaded model under one fingerprint — an index built by a separate
   *  embedding path would agree with the query side only by luck, and the
   *  fingerprint check cannot detect that because both would report the same
   *  pinned string.
   */
  readonly embedDocument: (text: string) => Effect.Effect<Int8Array, QueryEmbedderUnavailable>;
}

/** The one key an embedder registers under (§9.5's "one contract").
 *
 *  Read with `Effect.serviceOption` by the search service: a host that wires no
 *  embedder is not broken, it is a host whose vector leg reports §9.6's
 *  `embedder` absence (a fixture with no embedder, for one), and it
 *  must be a legal composition rather than a missing dependency.
 */
export class QueryEmbedder extends Context.Service<QueryEmbedder, QueryEmbedderApi>()(
  '@bible/core/search/QueryEmbedder',
) {}
