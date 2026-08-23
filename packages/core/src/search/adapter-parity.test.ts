/** §10's adapter check: "transformers.js WebGPU adapter, native CPU adapter
 *  under Electron main, and native CPU adapter under Bun all produce query
 *  vectors for the same pinned fingerprint that agree within the declared
 *  numeric tolerance."
 *
 *  **This suite skips loudly.** Model weights are not committed (§10), so on a
 *  machine that has never downloaded EmbeddingGemma there is nothing to compare
 *  and the honest outcome is a *reported* skip — never a pass. A parity check
 *  that quietly succeeds when it ran nothing is worse than no parity check: it
 *  is the same green as a real one.
 *
 *  What runs here is the Bun and Electron-main pair, which share this process's
 *  runtime. The WebGPU adapter cannot run under Bun at all — there is no GPU
 *  device outside a browser — so its leg of the check lives in
 *  `apps/web/src/workers/search-round-trip.test.ts`, against the same fixture
 *  queries and the same `vectorsAgree` bound. Splitting it that way is what
 *  keeps each adapter checked *in the host it ships in*, which is the property
 *  §10's rule 3 is actually after.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Console, Effect, Option, Result } from 'effect';
import type { Layer } from 'effect';

import { QueryEmbedder, vectorsAgree } from './embedder.js';
import { layerBunEmbedder } from './embedder-bun.js';
import { layerNodeEmbedder } from './embedder-node.js';
import { DOCUMENT_PREFIX, QUERY_PREFIX, truncateToMrl } from './embedder-transformers.js';
import { GOLDEN_QUERIES } from './golden-fixture.js';
import { DIMENSIONS, MODEL_FINGERPRINT } from './vector-index.js';

/** The queries the two adapters are compared on: §9.7's own set, so the parity
 *  check and the acceptance rule cannot drift apart. */
const QUERIES = GOLDEN_QUERIES.map((golden) => golden.query.text);

const embedWith = (layer: Layer.Layer<QueryEmbedder>, query: string) =>
  Effect.flatMap(QueryEmbedder, (embedder) => embedder.embedQuery(query)).pipe(
    Effect.provide(layer),
    Effect.result,
  );

/** The document side, under the other pinned prefix. */
const embedDocumentWith = (layer: Layer.Layer<QueryEmbedder>, text: string) =>
  Effect.flatMap(QueryEmbedder, (embedder) => embedder.embedDocument(text)).pipe(
    Effect.provide(layer),
    Effect.result,
  );

/** Whether this machine can load the model at all.
 *
 *  Probed once with the cheapest possible query. A failure here is the "model
 *  absent" state §10 asks to be skipped visibly, not a test failure: the
 *  adapters are correct, the weights are not present. */
// Top-level await, deliberately: `it.skipIf` needs the boolean at module
// evaluation, before any test body runs. Nothing inside an `Effect.gen` can
// supply it, because the describe block is built before the runtime starts.
// oxlint-disable-next-line effect/noAsyncFunction -- it.skipIf needs this at module-evaluation time
const probe = await Effect.runPromise(embedWith(layerBunEmbedder, 'probe'));
const modelAvailable = Result.isSuccess(probe);

describe('§10 embedding adapter parity', () => {
  it('reports whether the model was available, so a skip is never silent', () =>
    // Deliberately always green, and deliberately loud. Its whole job is to put
    // the reason in the output when the substantive tests below skip, so a run
    // that checked nothing cannot be mistaken for a run that checked everything.
    Effect.runPromise(
      Effect.gen(function* () {
        if (!modelAvailable) {
          const reason = Result.match(probe, {
            onFailure: (failure) => failure.reason,
            onSuccess: () => 'unknown',
          });
          yield* Console.warn(
            `[search] adapter parity SKIPPED — ${MODEL_FINGERPRINT} is not loadable here: ${reason}\n` +
              `[search] set BIBLE_MODEL_CACHE, or fetch the model, to run the real comparison.`,
          );
        }
        // The probe resolved one way or the other, which is what makes the
        // skip decision above a decision rather than an unhandled state.
        expect(Result.isSuccess(probe) || Result.isFailure(probe)).toBe(true);
      }),
    ));

  it.skipIf(!modelAvailable)(
    'the Bun and Electron-main adapters agree within the declared tolerance',
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          for (const query of QUERIES) {
            const bun = yield* embedWith(layerBunEmbedder, query);
            const node = yield* embedWith(layerNodeEmbedder, query);
            expect(Result.isSuccess(bun)).toBe(true);
            expect(Result.isSuccess(node)).toBe(true);
            if (Result.isFailure(bun) || Result.isFailure(node)) return;
            expect({ query, agree: vectorsAgree(bun.success, node.success) }).toEqual({
              query,
              agree: true,
            });
          }
        }),
      ),
    120_000,
  );

  it.skipIf(!modelAvailable)(
    'both adapters declare the pinned fingerprint',
    () =>
      // The precondition the whole vector leg rests on: an adapter whose
      // fingerprint disagreed with the index's would be refused at query time,
      // and §10's mismatch test only means something if the shipping adapters
      // agree with the constant.
      Effect.runPromise(
        Effect.gen(function* () {
          for (const layer of [layerBunEmbedder, layerNodeEmbedder]) {
            const fingerprint = yield* Effect.map(
              QueryEmbedder,
              (embedder) => embedder.fingerprint,
            ).pipe(Effect.provide(layer));
            expect(fingerprint).toBe(MODEL_FINGERPRINT);
          }
        }),
      ),
    120_000,
  );

  it.skipIf(!modelAvailable)(
    'produces a 256-d int8 vector, which is what the index is scanned with',
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const query = Option.getOrElse(Arr.get(QUERIES, 0), () => 'the sanctuary');
          const result = yield* embedWith(layerBunEmbedder, query);
          expect(Result.isSuccess(result)).toBe(true);
          if (Result.isFailure(result)) return;
          expect(result.success.length).toBe(DIMENSIONS);
          expect(result.success).toBeInstanceOf(Int8Array);
        }),
      ),
    120_000,
  );
});

/** §9.5's retrieval contract, against the real weights.
 *
 *  These are the tests that would have caught the mean-pooling defect. The
 *  adapter parity checks above compare two adapters to *each other*, and two
 *  adapters running the same wrong graph agree perfectly — so parity alone is
 *  blind to the one failure that matters most: an embedding that is the right
 *  shape and the wrong geometry.
 *
 *  What is checked instead is a property of the *model*: a query must sit closer
 *  to the paragraph that answers it than to one that does not. That is the only
 *  thing the vector leg is for, and it is false under any of the three defects
 *  the fingerprint now names.
 */
describe('§9.5 the retrieval embedding, against the real model', () => {
  /** Cosine over two int8 vectors, which under one fixed quantization scale is
   *  a monotone function of the float cosine. */
  const cosine = (left: Int8Array, right: Int8Array): number => {
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let axis = 0; axis < left.length; axis += 1) {
      const a = left[axis] ?? 0;
      const b = right[axis] ?? 0;
      dot += a * b;
      leftNorm += a * a;
      rightNorm += b * b;
    }
    return dot / Math.sqrt(leftNorm * rightNorm);
  };

  it('pins the model card’s two retrieval prefixes verbatim', () => {
    // From `onnx-community/embeddinggemma-300m-ONNX`'s README. The trailing
    // space in each is load bearing — dropping it changes the tokenization and
    // therefore every vector the build produces.
    expect(QUERY_PREFIX).toBe('task: search result | query: ');
    expect(DOCUMENT_PREFIX).toBe('title: none | text: ');
  });

  it.skipIf(!modelAvailable)(
    'places a query nearer the paragraph that answers it than an unrelated one',
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const question = 'what happens at the close of probation';
          const answer =
            'When the work of the investigative judgment closes, the cases of all are decided and probation ends.';
          const unrelated =
            'Jupiter, the largest planet in our solar system, has a prominent red spot.';

          const query = yield* embedWith(layerBunEmbedder, question);
          const relevant = yield* embedDocumentWith(layerBunEmbedder, answer);
          const irrelevant = yield* embedDocumentWith(layerBunEmbedder, unrelated);
          expect(Result.isSuccess(query)).toBe(true);
          expect(Result.isSuccess(relevant)).toBe(true);
          expect(Result.isSuccess(irrelevant)).toBe(true);
          if (
            Result.isFailure(query) ||
            Result.isFailure(relevant) ||
            Result.isFailure(irrelevant)
          ) {
            return;
          }

          const near = cosine(query.success, relevant.success);
          const far = cosine(query.success, irrelevant.success);
          // Measured on this machine against the fp32 weights: 0.697 vs 0.071.
          // The bounds are loose enough to survive kernel differences between
          // hosts and tight enough that the mean-pooled path (which scored
          // cosine 0.008 against the trained head) cannot satisfy them.
          expect(near).toBeGreaterThan(0.5);
          expect(far).toBeLessThan(0.35);
          expect(near - far).toBeGreaterThan(0.3);
        }),
      ),
    180_000,
  );

  it.skipIf(!modelAvailable)(
    'embeds a query and a document differently, because the model is asymmetric',
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          // The same text through the two methods must not produce the same
          // vector: if it did, the prefixes would not be reaching the model and
          // the document side would be embedded in the query's region.
          const text = 'the sanctuary in heaven is the center of Christ’s work';
          const asQuery = yield* embedWith(layerBunEmbedder, text);
          const asDocument = yield* embedDocumentWith(layerBunEmbedder, text);
          expect(Result.isSuccess(asQuery)).toBe(true);
          expect(Result.isSuccess(asDocument)).toBe(true);
          if (Result.isFailure(asQuery) || Result.isFailure(asDocument)) return;
          expect([...asQuery.success]).not.toEqual([...asDocument.success]);
        }),
      ),
    180_000,
  );
});

/** The device-independent half of the adapter, which every machine can check.
 *
 *  §9.5's MRL truncation and §9.2's quantization are where two adapters would
 *  most plausibly diverge — they are arithmetic each host could have spelled
 *  itself — so they are shared code, and this is the test that says so. It runs
 *  whether or not the model is present, because it needs no model. */
describe('§9.5 the shared vector post-processing', () => {
  /** Unwraps a row this build accepts. A `None` here is the test's own premise
   *  failing, not the assertion under test, so it fails loudly rather than
   *  defaulting to an empty vector. */
  const accepted = (values: readonly number[]): Float32Array => {
    const truncated = truncateToMrl(values);
    // `expect` rather than a throw: a rejection here means the *fixture* is
    // wrong, and this reports which one without a stack through the helper.
    expect(Option.isSome(truncated)).toBe(true);
    return Option.getOrElse(truncated, () => new Float32Array(DIMENSIONS));
  };

  it('truncates to 256 dimensions', () => {
    const full = Array.from({ length: 768 }, (_value, axis) => Math.sin(axis));
    expect(accepted(full).length).toBe(DIMENSIONS);
  });

  it('keeps the first 256 components, in order', () => {
    // Matryoshka truncation is a *prefix*, and the fingerprint's `mrl` component
    // is the claim that this prefix is meaningful. Taking any other slice would
    // produce vectors of the right shape and the wrong geometry.
    const full = Array.from({ length: 768 }, (_value, axis) => axis + 1);
    const truncated = accepted(full);
    const ratio = (truncated[0] ?? 0) / (truncated[1] ?? 1);
    expect(ratio).toBeCloseTo(1 / 2, 6);
  });

  it('re-normalizes after truncating', () => {
    // A prefix of a unit vector is not a unit vector, and `quantize` maps the
    // unit range onto [-127, 127] with one fixed scale — so an adapter that
    // skipped this step would quantize a shorter vector into a smaller corner
    // of the int8 range, losing precision and failing parity for a reason
    // unrelated to the model.
    const full = Array.from({ length: 768 }, () => 1);
    const truncated = accepted(full);
    let sum = 0;
    for (const value of truncated) sum += value * value;
    expect(Math.sqrt(sum)).toBeCloseTo(1, 6);
  });

  /** §10's "reject, never pad" gate (round-2 F9).
   *
   *  The earlier implementation read `values[axis] ?? 0`, so a model returning
   *  fewer than 256 components produced a 256-d vector whose tail was zeros.
   *  That vector passes every shape check the scan makes, so the ranking it
   *  produces is a ranking over a query nobody asked — the one failure mode no
   *  downstream code can detect. These three cases fail against the padding
   *  implementation and pass against the rejecting one. */
  it('rejects a row shorter than 256 components rather than padding it', () => {
    expect(Option.isNone(truncateToMrl(Array.from({ length: 128 }, () => 0.1)))).toBe(true);
    expect(Option.isNone(truncateToMrl(Array.from({ length: 255 }, () => 0.1)))).toBe(true);
    // Exactly 256 is the boundary and is accepted.
    expect(Option.isSome(truncateToMrl(Array.from({ length: DIMENSIONS }, () => 0.1)))).toBe(true);
  });

  it('rejects a row carrying a non-finite component', () => {
    const withNaN = Array.from({ length: 768 }, () => 0.1);
    withNaN[7] = Number.NaN;
    expect(Option.isNone(truncateToMrl(withNaN))).toBe(true);

    const withInfinity = Array.from({ length: 768 }, () => 0.1);
    withInfinity[200] = Number.POSITIVE_INFINITY;
    expect(Option.isNone(truncateToMrl(withInfinity))).toBe(true);

    const withNegativeInfinity = Array.from({ length: 768 }, () => 0.1);
    withNegativeInfinity[255] = Number.NEGATIVE_INFINITY;
    expect(Option.isNone(truncateToMrl(withNegativeInfinity))).toBe(true);

    // A non-finite value *past* the 256-d prefix is never read, so it is not a
    // reason to refuse a row this build can use.
    const beyondPrefix = Array.from({ length: 768 }, () => 0.1);
    beyondPrefix[300] = Number.NaN;
    expect(Option.isSome(truncateToMrl(beyondPrefix))).toBe(true);
  });

  it('rejects an all-zero embedding rather than emitting a zero vector', () => {
    // A zero vector dots to zero against every document, so it ranks the index
    // arbitrarily. The old code returned it and `quantize` turned it into 256
    // zero bytes that the scan happily scored.
    expect(Option.isNone(truncateToMrl(Array.from({ length: 768 }, () => 0)))).toBe(true);
  });
});
