/** §9.2's flat vector index: format, parse, and scan.
 *
 *  One vector per paragraph, 256 dimensions, `Int8Array`, out of SQLite. A flat
 *  buffer scanned with dot products is the same performance class as sqlite-vec
 *  (itself brute-force KNN today), runs byte-identically in a browser worker and
 *  in Electron and under Bun, and needs zero native or WASM SQLite work — which
 *  is the whole reason §9.1 re-implements qmd's design rather than using it.
 *
 *  **Everything here is pure.** The parser takes an `ArrayBuffer` and the scanner
 *  takes a parsed index; neither reads a file. Hosts differ in how bytes arrive
 *  — `fs.readFile`, OPFS, a packaged asset — and nothing about the format does,
 *  so the format lives in portable core and the byte delivery lives in adapters.
 *
 *  ## Layout
 *
 *  ```
 *  magic        4 bytes   "BVI1"
 *  formatMajor  u16       the layout below; a mismatch is unreadable
 *  dimensions   u16       256, checked against DIMENSIONS
 *  count        u32       how many vectors follow
 *  fingerprintLen u16     byte length of the UTF-8 fingerprint
 *  manifestLen  u32       byte length of the UTF-8 JSON manifest
 *  fingerprint  bytes     the model fingerprint (§9.5)
 *  manifest     bytes     JSON: per-book ranges plus the paragraph id table
 *  vectors      count × dimensions int8, contiguous, row-major
 *  ```
 *
 *  The header is fixed-width and little-endian so a host can read `count` and
 *  the fingerprint without parsing the manifest — the fingerprint check (§9.6's
 *  `fingerprint` absence) has to be answerable before committing to reading a
 *  246 MB file.
 */

import { Array as Arr, Option, Schema } from 'effect';

/** §9.5's one pinned fingerprint, as one constant.
 *
 *  **EmbeddingGemma-300M, 256-d MRL, int8.** Matryoshka training is what makes
 *  the 256-d truncation a supported operation rather than a lossy hack, so the
 *  `mrl` component is part of the identity: a 256-d truncation of a
 *  non-Matryoshka model would produce vectors of the same shape and the wrong
 *  geometry, and a fingerprint that did not say `mrl` could not tell them apart.
 *
 *  Every producer and every consumer compares against this exact string. An
 *  index built under any other value is refused with §9.6's `fingerprint`
 *  absence rather than searched — §10 is explicit that a mismatch "invalidates
 *  the vector leg rather than returning wrong neighbors".
 *
 *  **Every component names something that changes the geometry**, which is what
 *  makes the string a fingerprint rather than a label. It was widened from
 *  `EmbeddingGemma-300M/256d-mrl/int8` when three parts of the embedding
 *  contract were corrected, each of which silently produces vectors of the same
 *  shape and a different meaning:
 *
 *  - `sentence-embedding` — the model's trained `sentence_embedding` output,
 *    not a mean pool over `last_hidden_state`. Measured locally against the
 *    real weights, the two agree at cosine **0.0081**: they are all but
 *    orthogonal, so an index built one way and queried the other returns noise.
 *  - `retrieval` — the model card's retrieval prefixes, `task: search result |
 *    query: ` on the query side and `title: none | text: ` on the document
 *    side. EmbeddingGemma is asymmetric, and a document embedded through the
 *    query prefix lands in the wrong region.
 *  - `int8-fixed` — one fixed quantization scale rather than a per-vector
 *    maximum. A per-row scale makes the pairwise multiplier vary by candidate,
 *    which reverses cosine order (see `quantize`).
 *
 *  Any index built before this change is refused, which is the correct outcome:
 *  it holds mean-pooled, unprefixed, per-row-scaled vectors that this build
 *  cannot rank against.
 */
export const MODEL_FINGERPRINT =
  'EmbeddingGemma-300M/sentence-embedding/retrieval/256d-mrl/int8-fixed';

/** The truncation §9.5 pins. Not a parameter: a 256-d index and a 768-d query
 *  produce a dot product that is silently meaningless, and the only defense that
 *  costs nothing is having exactly one number. */
export const DIMENSIONS = 256;

/** The layout above. Bumped only by a change that makes old bytes unreadable —
 *  which the fingerprint does not cover, because a format break and a model
 *  break are different invalidations with different fixes. */
export const FORMAT_MAJOR = 1;

const MAGIC = 'BVI1';
const MAGIC_BYTES = 4;
const HEADER_BYTES = MAGIC_BYTES + 2 + 2 + 4 + 2 + 4;

/** Where one book's vectors sit in the flat buffer (§9.2's per-book manifest).
 *
 *  The manifest exists so scope can grow incrementally — adding the pioneers
 *  later appends books and their vectors without a format break — and so a
 *  scoped search can skip whole ranges rather than scoring vectors it will
 *  discard.
 */
export class VectorBookRange extends Schema.Class<VectorBookRange>('Search/VectorBookRange')({
  bookCode: Schema.NonEmptyString,
  /** Index of this book's first vector, 0-based. */
  offset: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  count: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
}) {}

/** What the manifest carries beside the vectors.
 *
 *  `paragraphIds` is positional: the id at index *i* owns vector *i*. A parallel
 *  array rather than an id inside each row, because the vectors are a flat
 *  numeric buffer with no room for a string — and the join back to `paragraphs`
 *  is by this id, which §9.2 makes the index's only tie to the corpus.
 */
export class VectorManifest extends Schema.Class<VectorManifest>('Search/VectorManifest')({
  books: Schema.Array(VectorBookRange),
  paragraphIds: Schema.Array(Schema.NonEmptyString),
}) {}

/** Why a candidate buffer is not a usable index.
 *
 *  A closed union rather than a message, because the caller maps it onto §9.6's
 *  `VectorAbsenceReason` and the two cases map differently: a fingerprint
 *  mismatch is `fingerprint`, and everything else is `absent` — a file that will
 *  not parse is, for the reader, an index that is not there.
 */
export type VectorIndexFault =
  | { readonly _tag: 'malformed'; readonly detail: string }
  | { readonly _tag: 'fingerprint'; readonly found: string };

/** A parsed, usable index. */
export interface VectorIndex {
  readonly fingerprint: string;
  readonly dimensions: number;
  readonly count: number;
  readonly manifest: VectorManifest;
  /** `count × dimensions` int8 values, row-major. */
  readonly vectors: Int8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const malformed = (detail: string): VectorIndexFault => ({ _tag: 'malformed', detail });

const decodeManifest = Schema.decodeUnknownOption(Schema.fromJsonString(VectorManifest));
const encodeManifest = Schema.encodeSync(Schema.fromJsonString(VectorManifest));

/** Reads the header and manifest, and refuses anything this build cannot
 *  interpret (§9.6).
 *
 *  Every refusal here is a *typed fault*, never a throw and never a defect: an
 *  optional artifact that is truncated, foreign, or built by a future writer is
 *  a state the reader degrades from, exactly as an absent one is. The one thing
 *  it will not do is proceed on a fingerprint it does not recognize — that is
 *  the case §10 singles out, because the failure mode is silent wrong answers
 *  rather than missing ones.
 */
/** Quotes a diagnostic string through the JSON codec.
 *
 *  The magic bytes are read from an untrusted buffer, so a fault message that
 *  interpolated them raw could carry control characters into a log line. The
 *  Schema codec is the same escaping `JSON.stringify` did, spelled as the
 *  project's one JSON seam.
 */
const quoted = Schema.encodeSync(Schema.fromJsonString(Schema.String));

/** Every structural claim the manifest makes, checked (§9.6).
 *
 *  The scan reads `paragraphIds[row]` for each row a book range covers, and
 *  reads the vector buffer at `row * dimensions`. Four things have to hold for
 *  that to be meaningful, and none of them is implied by the manifest decoding:
 *
 *  1. **One id per vector.** `paragraphIds.length === count`, or the positional
 *     correspondence between ids and buffer rows is off by however many are
 *     missing — and every id from that point on names the wrong vector.
 *  2. **Unique ids.** Two rows sharing an id make the fusion score one
 *     paragraph twice and make the batch lookup ambiguous. A duplicate cannot
 *     be repaired at read time, so it is refused at parse time.
 *  3. **Ranges inside the buffer.** A range reaching past `count` sends the
 *     scan off the end, where `Arr.get` yields `None` and the row is silently
 *     dropped — a scan that quietly returns fewer neighbors than it should.
 *  4. **Non-overlapping, complete ranges.** Sorted, they must tile `[0, count)`
 *     exactly. An overlap scores a vector twice under two book codes; a gap
 *     makes a paragraph unreachable through a book-scoped query while it stays
 *     reachable through an unscoped one, which is a scope filter that changes
 *     the answer rather than narrowing it.
 *
 *  Returned as an `Option` of a fault rather than a boolean: the caller maps the
 *  fault onto §9.6's absence, and a boolean would lose which invariant broke at
 *  exactly the place an operator needs to read it.
 */
/** Whether a book starting off-cursor leaves vectors unclaimed or double-claimed. */
const relationAt = (offset: number, cursor: number): string => {
  if (offset > cursor) return 'gap';
  return 'overlap';
};

const validateManifest = (
  manifest: VectorManifest,
  count: number,
): Option.Option<VectorIndexFault> => {
  if (manifest.paragraphIds.length !== count) {
    return Option.some(
      malformed(`manifest names ${manifest.paragraphIds.length} ids for ${count} vectors`),
    );
  }
  const unique = new Set(manifest.paragraphIds);
  if (unique.size !== manifest.paragraphIds.length) {
    return Option.some(
      malformed(`manifest repeats ids: ${manifest.paragraphIds.length - unique.size} duplicates`),
    );
  }
  const sorted = [...manifest.books].sort((left, right) => left.offset - right.offset);
  let cursor = 0;
  for (const book of sorted) {
    if (book.offset !== cursor) {
      // Which way the tiling broke: a book starting past the cursor leaves
      // vectors no book claims, one starting before it claims vectors twice.
      const relation = relationAt(book.offset, cursor);
      return Option.some(
        malformed(
          `${relation} at vector ${cursor}: ${quoted(book.bookCode)} starts at ${book.offset}`,
        ),
      );
    }
    cursor += book.count;
    if (cursor > count) {
      return Option.some(
        malformed(`${quoted(book.bookCode)} ends at ${cursor}, past the ${count} vectors`),
      );
    }
  }
  if (cursor !== count) {
    return Option.some(malformed(`books cover ${cursor} of ${count} vectors`));
  }
  return Option.none();
};

export const parseVectorIndex = (
  buffer: ArrayBuffer,
): { readonly _tag: 'ok'; readonly index: VectorIndex } | (VectorIndexFault & { _tag: string }) => {
  if (buffer.byteLength < HEADER_BYTES) return malformed('shorter than the header');
  const view = new DataView(buffer);
  const magic = decoder.decode(new Uint8Array(buffer, 0, MAGIC_BYTES));
  if (magic !== MAGIC) return malformed(`magic ${quoted(magic)}`);

  const formatMajor = view.getUint16(MAGIC_BYTES, true);
  if (formatMajor !== FORMAT_MAJOR) return malformed(`format major ${formatMajor}`);

  const dimensions = view.getUint16(MAGIC_BYTES + 2, true);
  if (dimensions !== DIMENSIONS) return malformed(`dimensions ${dimensions}`);

  const count = view.getUint32(MAGIC_BYTES + 4, true);
  const fingerprintLen = view.getUint16(MAGIC_BYTES + 8, true);
  const manifestLen = view.getUint32(MAGIC_BYTES + 10, true);

  const fingerprintAt = HEADER_BYTES;
  const manifestAt = fingerprintAt + fingerprintLen;
  const vectorsAt = manifestAt + manifestLen;
  const vectorBytes = count * dimensions;
  const expected = vectorsAt + vectorBytes;
  // **Exact**, not "at least". A buffer longer than the layout describes is a
  // buffer this build cannot account for — a truncated download that resumed
  // into the wrong offset, a concatenation, a writer from another format — and
  // reading the prefix of it would be reading an index nobody wrote.
  if (buffer.byteLength !== expected) {
    return malformed(`length ${buffer.byteLength} bytes, ${expected} expected`);
  }

  const fingerprint = decoder.decode(new Uint8Array(buffer, fingerprintAt, fingerprintLen));
  // Before the manifest, because §10 requires a mismatch to invalidate rather
  // than mislead, and a foreign index's manifest is not worth parsing.
  if (fingerprint !== MODEL_FINGERPRINT) return { _tag: 'fingerprint', found: fingerprint };

  const manifest = decodeManifest(decoder.decode(new Uint8Array(buffer, manifestAt, manifestLen)));
  if (Option.isNone(manifest)) return malformed('manifest is not a VectorManifest');
  const fault = validateManifest(manifest.value, count);
  if (Option.isSome(fault)) return fault.value;

  return {
    _tag: 'ok',
    index: {
      fingerprint,
      dimensions,
      count,
      manifest: manifest.value,
      vectors: new Int8Array(buffer.slice(vectorsAt, vectorsAt + vectorBytes)),
    },
  };
};

/** Writes the layout above. Beside the parser on purpose: a format whose reader
 *  and writer live in two packages is a format that gets read one way and
 *  written another, and §10's builder verification ("verify the writer with
 *  synthetic vectors in a test") is only meaningful if the writer under test is
 *  the writer that ships. */
export const encodeVectorIndex = (input: {
  readonly fingerprint: string;
  readonly manifest: VectorManifest;
  readonly vectors: Int8Array;
}): ArrayBuffer => {
  const fingerprint = encoder.encode(input.fingerprint);
  const manifest = encoder.encode(encodeManifest(input.manifest));
  const count = input.manifest.paragraphIds.length;
  const total = HEADER_BYTES + fingerprint.byteLength + manifest.byteLength + count * DIMENSIONS;
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  bytes.set(encoder.encode(MAGIC), 0);
  view.setUint16(MAGIC_BYTES, FORMAT_MAJOR, true);
  view.setUint16(MAGIC_BYTES + 2, DIMENSIONS, true);
  view.setUint32(MAGIC_BYTES + 4, count, true);
  view.setUint16(MAGIC_BYTES + 8, fingerprint.byteLength, true);
  view.setUint32(MAGIC_BYTES + 10, manifest.byteLength, true);

  const fingerprintAt = HEADER_BYTES;
  const manifestAt = fingerprintAt + fingerprint.byteLength;
  bytes.set(fingerprint, fingerprintAt);
  bytes.set(manifest, manifestAt);
  bytes.set(
    new Uint8Array(input.vectors.buffer, input.vectors.byteOffset, count * DIMENSIONS),
    manifestAt + manifest.byteLength,
  );
  return buffer;
};

/** One neighbor from a scan: the paragraph id and its dot product. */
export interface VectorNeighbor {
  readonly paragraphId: string;
  readonly similarity: number;
}

/** What one scan did: the neighbors it kept, and how many rows it looked at.
 *
 *  `scanned` is returned rather than re-derived by the caller because it is the
 *  only place the number is *known*. `VectorLegRan.scanned` documents itself as
 *  "how many paragraphs the scan considered", and the service used to report
 *  `index.count` for it — the whole index — which is a different number
 *  whenever `allow` narrows the scan to a book's range. A reader shown "961,761
 *  vectors scanned" for a single-book query is being told something untrue
 *  about the search that answered them, and no assertion over the returned
 *  neighbors could have caught it. Counting inside the loop that does the work
 *  is what makes the field un-fakeable.
 */
export interface VectorScan {
  readonly neighbors: readonly VectorNeighbor[];
  /** How many index rows this scan computed a dot product for. */
  readonly scanned: number;
}

/** §9.2's scan: dot products, in a pure portable function.
 *
 *  The query arrives already int8-quantized under the same scheme the index was
 *  built with, so the dot product is integer arithmetic and the result is a
 *  monotone function of cosine similarity — which is all a ranking needs.
 *  Normalizing to a true cosine would divide every term by the same two norms
 *  and change no order, at the cost of a square root per vector.
 *
 *  `allow` restricts the scan to a book set (§9.2's per-book manifest), so a
 *  scope- or book-narrowed query scores only the ranges it can return rather
 *  than scoring the corpus and discarding most of it.
 *
 *  A bounded insertion into a `topK`-sized array rather than sorting `count`
 *  scores: at 961,761 paragraphs the sort is the expensive half, and `topK` is
 *  30.
 *
 *  Returns the scanned row count alongside the neighbors — see `VectorScan`.
 */
export const scanVectorIndex = (
  index: VectorIndex,
  query: Int8Array,
  options: {
    readonly topK: number;
    readonly allow?: ReadonlySet<string>;
  },
): VectorScan => {
  // A query of any other length cannot be dotted against this index. The old
  // code read `query[axis] ?? 0` and treated a short query as one padded with
  // zeros, which produces a full ranking over a truncated query — the worst
  // shape of wrong, because nothing downstream can tell. An empty result is the
  // honest answer, and the caller reports it as a vector leg that found
  // nothing.
  if (query.length !== index.dimensions) return { neighbors: [], scanned: 0 };
  const ranges = rangesFor(index, Option.fromNullishOr(options.allow));
  const dimensions = index.dimensions;
  const vectors = index.vectors;
  const ids = index.manifest.paragraphIds;
  const best: VectorNeighbor[] = [];
  let floor = Number.NEGATIVE_INFINITY;
  let scanned = 0;

  for (const range of ranges) {
    const end = range.offset + range.count;
    for (let row = range.offset; row < end; row += 1) {
      scanned += 1;
      const base = row * dimensions;
      // Four accumulators, unrolled by four.
      //
      // This loop is the whole cost of a semantic query: 961,253 vectors ×
      // 256 dimensions is ~246 million multiply-adds, and it ran at ~170 ms in
      // production. One serial `sum` makes every iteration wait for the
      // previous add, so the pipeline stalls on the dependency chain rather
      // than on the arithmetic; four independent accumulators let four
      // multiply-adds be in flight at once. Measured over 300,000 vectors and
      // scaled to the deployed index: 133 ms serial, 83 ms unrolled, a 38%
      // cut for the same values in the same order.
      //
      // Four, not more: 8× measured 83 ms and an Int32 copy of the query
      // 81 ms, both inside the noise of 4×. The gain is from breaking the
      // dependency chain, and four accumulators already break it.
      //
      // The parser guarantees `count * dimensions` int8 values and ranges
      // inside `count`, so every read below is in bounds; the `?? 0` is
      // TypeScript satisfying `noUncheckedIndexedAccess`, not a shape check.
      let sum0 = 0;
      let sum1 = 0;
      let sum2 = 0;
      let sum3 = 0;
      // `dimensions` is 256 for every index this format describes, so the
      // unrolled loop consumes all of it; the remainder loop below is for a
      // future dimension count that is not a multiple of four, and costs one
      // predictable branch per row when it has nothing to do.
      const unrolled = dimensions - (dimensions % 4);
      for (let axis = 0; axis < unrolled; axis += 4) {
        sum0 += (vectors[base + axis] ?? 0) * (query[axis] ?? 0);
        sum1 += (vectors[base + axis + 1] ?? 0) * (query[axis + 1] ?? 0);
        sum2 += (vectors[base + axis + 2] ?? 0) * (query[axis + 2] ?? 0);
        sum3 += (vectors[base + axis + 3] ?? 0) * (query[axis + 3] ?? 0);
      }
      let sum = sum0 + sum1 + sum2 + sum3;
      for (let axis = unrolled; axis < dimensions; axis += 1) {
        sum += (vectors[base + axis] ?? 0) * (query[axis] ?? 0);
      }
      if (best.length === options.topK && sum <= floor) continue;
      const paragraphId = Arr.get(ids, row);
      if (Option.isNone(paragraphId)) continue;
      insert(best, { paragraphId: paragraphId.value, similarity: sum }, options.topK);
      if (best.length === options.topK) {
        floor = Option.match(Arr.last(best), {
          onNone: () => floor,
          onSome: (worst) => worst.similarity,
        });
      }
    }
  }
  return { neighbors: best, scanned };
};

/** Which stretches of the buffer the scan touches.
 *
 *  With no `allow` set this is one range covering everything rather than the
 *  manifest's book list, because the books need not tile the buffer
 *  contiguously and a whole-index scan should not depend on whether they do.
 */
const rangesFor = (
  index: VectorIndex,
  allow: Option.Option<ReadonlySet<string>>,
): readonly { readonly offset: number; readonly count: number }[] =>
  Option.match(allow, {
    onNone: () => [{ offset: 0, count: index.count }],
    onSome: (codes) => index.manifest.books.filter((book) => codes.has(book.bookCode)),
  });

/** Keeps `best` sorted descending and no longer than `topK`. */
const insert = (best: VectorNeighbor[], candidate: VectorNeighbor, topK: number): void => {
  let at = best.length;
  while (at > 0 && (best[at - 1]?.similarity ?? 0) < candidate.similarity) at -= 1;
  best.splice(at, 0, candidate);
  if (best.length > topK) best.length = topK;
};

/** The one fixed quantization scale (§9.5).
 *
 *  Not derived per vector. Every vector this format stores — query and document
 *  alike — is unit-normalized after the 256-d MRL truncation, so every component
 *  lies in [-1, 1] and a single global scale of 127 maps the whole range with no
 *  clipping and no per-row state.
 */
export const QUANTIZATION_SCALE = 127;

/** Quantizes a **unit-normalized** float embedding to the int8 scheme the index
 *  stores (§9.5).
 *
 *  **One fixed global scale, not a per-vector maximum.** The per-vector scheme
 *  the earlier version used is the standard one for *storage*, and it is wrong
 *  here, because the dot product is the ranking. Under per-vector scaling the
 *  stored vector is `127/max_d · d`, so scoring a query `q` against documents
 *  `d₁, d₂` compares `(127/max₁)·q·d₁` against `(127/max₂)·q·d₂` — two different
 *  positive multipliers, one per candidate. A positive constant preserves order
 *  only when it is the *same* constant, and it is not: `max_d` varies per row.
 *  A document whose components happen to be small gets scaled up and outranks a
 *  document that is genuinely closer to the query. The regression test in
 *  `vector-index.test.ts` exhibits exactly that reversal.
 *
 *  With one fixed scale the stored value is `127·d` for every row, the pairwise
 *  multiplier is the single constant `127²`, and the int8 dot product is a
 *  monotone function of the float cosine — which is all a ranking needs.
 *
 *  Beside the format rather than in each adapter, because the query side and the
 *  document side must quantize identically and there are four producers of the
 *  query side.
 *
 *  Components are clamped to ±127 rather than assumed in range: the caller
 *  normalizes, but a vector arriving unnormalized should saturate rather than
 *  wrap through `Int8Array`'s modular assignment.
 */
export const quantize = (values: readonly number[] | Float32Array): Int8Array => {
  const out = new Int8Array(values.length);
  for (let axis = 0; axis < values.length; axis += 1) {
    const scaled = Math.round((values[axis] ?? 0) * QUANTIZATION_SCALE);
    out[axis] = Math.max(-127, Math.min(127, scaled));
  }
  return out;
};
