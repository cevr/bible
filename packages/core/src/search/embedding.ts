/** The embedding model's contract with the text it is given and the numbers
 *  it returns (§9.5), apart from any runtime that executes it.
 *
 *  Every host that embeds — the ONNX adapter under Bun, Workers AI on a
 *  Worker — wraps text in these prefixes and turns the model's output into the
 *  index's geometry with `truncateToMrl` and `quantize`. One definition, so a
 *  query embedded on one host lands where the index built on another put its
 *  documents.
 */

import { Option } from 'effect';

import { DIMENSIONS } from './vector-index.js';

/** The retrieval prefixes the model card pins, verbatim.
 *
 *  From `onnx-community/embeddinggemma-300m-ONNX`'s README: query prompts take
 *  the form `task: {task description} | query: ` with `search result` as the
 *  default task, and document prompts take `title: {title | "none"} | text: `.
 *
 *  Exported so the builder and the adapter parity test assert against the same
 *  strings rather than each retyping them — a trailing space dropped from
 *  either one changes the tokenization and therefore the vector.
 */
export const QUERY_PREFIX = 'task: search result | query: ';
export const DOCUMENT_PREFIX = 'title: none | text: ';

/** §9.5's 256-d MRL truncation, then re-normalization.
 *
 *  EmbeddingGemma is Matryoshka-trained, so the first 256 components of its
 *  768-d output are a supported, low-loss embedding rather than an arbitrary
 *  slice — which is what makes the `mrl` component of the fingerprint load
 *  bearing. Truncating a non-Matryoshka model here would produce vectors of the
 *  right shape and the wrong geometry, and nothing downstream could tell.
 *
 *  The re-normalization is what makes the fixed quantization scale exact: a
 *  prefix of a unit vector is not a unit vector, and `quantize` maps the range
 *  [-1, 1] onto [-127, 127] with no per-row state. An unnormalized prefix would
 *  clip or under-use the range depending on the text.
 *
 *  **Rejects, never pads.** The earlier version read `values[axis] ?? 0`, so a
 *  model that returned 128 components — a truncated download, the wrong graph,
 *  a batch dimension misread — produced a 256-d vector whose second half was
 *  zeros. That vector has the right *shape*, so the parser accepts it, the
 *  scan dots it against the index, and the ranking it produces is a ranking
 *  over a query that was never asked. Nothing downstream can tell. The same
 *  argument applies to `NaN` and `±Infinity`: `quantize` rounds `NaN` to `0`
 *  and saturates infinities to ±127, so a broken model output would silently
 *  become a plausible query vector. Both are `None` here, and the adapter turns
 *  that into §9.6's `embedder` absence — a search that says it ran text-only,
 *  which is the honest answer.
 */
export const truncateToMrl = (
  values: readonly number[] | Float32Array,
): Option.Option<Float32Array> => {
  if (values.length < DIMENSIONS) return Option.none();
  const out = new Float32Array(DIMENSIONS);
  let sum = 0;
  for (let axis = 0; axis < DIMENSIONS; axis += 1) {
    const value = values[axis] ?? 0;
    if (!Number.isFinite(value)) return Option.none();
    out[axis] = value;
    sum += value * value;
  }
  const norm = Math.sqrt(sum);
  // A zero vector cannot be normalized, and it is not an embedding: every
  // component is zero, so it dots to zero against every document and ranks the
  // index arbitrarily. Refused for the same reason a short row is.
  if (norm === 0 || !Number.isFinite(norm)) return Option.none();
  for (let axis = 0; axis < DIMENSIONS; axis += 1) out[axis] = (out[axis] ?? 0) / norm;
  return Option.some(out);
};
