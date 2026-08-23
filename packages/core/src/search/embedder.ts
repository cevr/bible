/** §9.5's embedding adapter contract: one `Context.Service`, one fingerprint,
 *  no implementation in core.
 *
 *  Three hosts embed a query three different ways — transformers.js on WebGPU in
 *  the web worker, native ONNX CPU in Electron main, native ONNX CPU under Bun —
 *  and every one of them must produce a vector this build can dot against the
 *  installed index. What makes that checkable rather than hoped for is that the
 *  adapter *declares its fingerprint*, and the search service compares that
 *  declaration against the index's before using a single vector from it.
 *
 *  **Core has no implementation and cannot have one.** Every embedder needs an
 *  ONNX runtime, which is a host binary on two of the three clients and a WebGPU
 *  device on the third. The three adapters live beside their hosts; what lives
 *  here is the shape they satisfy and the reason they have to agree.
 */

import { Context, Schema } from 'effect';
import type { Effect } from 'effect';

/** Why this host cannot embed a query right now (§9.6's `embedder` absence).
 *
 *  A typed failure rather than a defect, because every one of these is a *state*
 *  a client renders rather than a bug it crashes on: a browser without WebGPU,
 *  a desktop install whose model files were never downloaded, a model that
 *  loaded but produced the wrong shape. §9.5 is explicit that no-WebGPU web
 *  "degrades to lexical-only with the typed absence", which requires the
 *  embedder to be able to say no.
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
   *  returning floats would make each host responsible for applying it, which
   *  is three places for the scale factor to be spelled differently.
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

/** The one key all three adapters register under (§9.5's "one contract").
 *
 *  Read with `Effect.serviceOption` by the search service: a host that wires no
 *  embedder is not broken, it is a host whose vector leg reports §9.6's
 *  `embedder` absence. That is the web client without WebGPU, and it must be a
 *  legal composition rather than a missing dependency.
 */
export class QueryEmbedder extends Context.Service<QueryEmbedder, QueryEmbedderApi>()(
  '@bible/core/search/QueryEmbedder',
) {}

/** The tolerance §9.7 asks each client to agree within (§12: "set against
 *  measured adapter variance").
 *
 *  Expressed on the **int8 components**, which is where the variance actually
 *  lands: the three runtimes execute the same ONNX graph in float32 and differ
 *  only in kernel implementation and accumulation order, so the float outputs
 *  agree to roughly 1e-3 and the disagreement only becomes visible when
 *  `quantize` rounds a component sitting near a .5 boundary. One int8 step is
 *  that rounding, and nothing in a correct adapter should exceed it.
 *
 *  A component-wise bound rather than a cosine bound, because it fails *louder*:
 *  a cosine of 0.999 hides a handful of large component errors that a rank can
 *  turn on, while a per-component bound catches the one axis that moved.
 */
export const ADAPTER_COMPONENT_TOLERANCE = 1;

/** The share of components allowed to sit at the tolerance edge.
 *
 *  Every component may legitimately differ by one int8 step, so a bound of "no
 *  component differs by more than 1" is satisfied by two vectors that differ
 *  everywhere — which is not agreement. This second bound is what makes the
 *  first mean something: the adapters must agree *exactly* on the large majority
 *  of axes and differ by at most one step on the rest.
 */
export const ADAPTER_AGREEMENT_FLOOR = 0.9;

/** Whether two adapters' vectors for the same query agree within §9.7's
 *  declared tolerance.
 *
 *  In core rather than in each adapter's test, because §10 requires "all three
 *  adapters agree within a declared tolerance" and three suites each spelling
 *  the comparison is three chances to spell it leniently.
 */
export const vectorsAgree = (left: Int8Array, right: Int8Array): boolean => {
  if (left.length !== right.length || left.length === 0) return false;
  let exact = 0;
  for (let axis = 0; axis < left.length; axis += 1) {
    const delta = Math.abs((left[axis] ?? 0) - (right[axis] ?? 0));
    if (delta > ADAPTER_COMPONENT_TOLERANCE) return false;
    if (delta === 0) exact += 1;
  }
  return exact / left.length >= ADAPTER_AGREEMENT_FLOOR;
};
