/** The one embedding implementation, shared by all three adapters (§9.5).
 *
 *  §9.5 lists three adapters — transformers.js on WebGPU, native CPU under
 *  Electron main, native CPU under Bun — and §10 requires all three to "produce
 *  query vectors for the same pinned fingerprint that agree within the declared
 *  numeric tolerance". Three separate implementations of the same ONNX graph
 *  would make that agreement a coincidence to be measured; one implementation
 *  with a device parameter makes it a property of the code.
 *
 *  `@huggingface/transformers` is what allows that: it ships `onnxruntime-web`
 *  for the browser (WebGPU and WASM) and `onnxruntime-node` for Node and Bun, so
 *  the same graph runs on all three hosts and the *only* difference is the
 *  `device` string. That is why one library was chosen over pairing
 *  transformers.js with a separate `onnxruntime-node`: two libraries would be
 *  two graph executions to reconcile.
 *
 *  **This file is `*-transformers.ts`, not `*-bun.ts`.** It imports no host
 *  builtin — `@huggingface/transformers` is a plain dependency — so the oxlint
 *  portability boundary permits it in core, and the three host entry points
 *  beside it are thin `device` choices rather than three copies.
 *
 *  ## Why `AutoModel` rather than the `feature-extraction` pipeline
 *
 *  The pipeline mean-pools `last_hidden_state` and normalizes. EmbeddingGemma
 *  does not use that as its embedding: the exported graph has a second output,
 *  `sentence_embedding`, which is the trained pooling-and-projection head the
 *  model was actually optimized for. Measured against the real weights on this
 *  corpus's own text, the two outputs agree at cosine **0.0081** — they are
 *  effectively orthogonal, and an index built from one and queried with the
 *  other returns noise with no error anywhere.
 *
 *  With the correct output and the pinned prefixes, the same measurement gives
 *  cosine 0.6971 between a query and the paragraph that answers it, and 0.0709
 *  between that query and an unrelated paragraph — which is the separation the
 *  vector leg exists to exploit.
 */

import { Config, Effect, Layer, Option, SynchronizedRef } from 'effect';

import { QueryEmbedder, QueryEmbedderUnavailable, type QueryEmbedderApi } from './embedder.js';
import { DIMENSIONS, MODEL_FINGERPRINT, quantize } from './vector-index.js';

/** The model id the fingerprint names, as the loader asks for it. */
export const MODEL_ID = 'onnx-community/embeddinggemma-300m-ONNX';

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

/** Which ONNX execution provider this adapter runs on.
 *
 *  `webgpu` for the browser worker; `cpu` for Electron main and Bun. §9.5 rules
 *  the WASM fallback out as a query path — a ~3-7 s embed for a 300M model is
 *  not a search — so a browser without WebGPU declines rather than falling back,
 *  and the client reports §9.6's `embedder` absence. */
export type EmbedderDevice = 'webgpu' | 'cpu';

/** The dtype the model card permits and this build pins.
 *
 *  "EmbeddingGemma activations do not support `fp16` or its derivatives. Please
 *  use `fp32`, `q8`, or `q4`." `fp32` is the choice the fingerprint implies:
 *  a quantized graph would move the float outputs by more than the one-int8-step
 *  tolerance `vectorsAgree` allows between adapters. */
const MODEL_DTYPE = 'fp32';

/** EmbeddingGemma's context window, from the model's own
 *  `max_position_embeddings` (and `model_max_length` in its tokenizer config).
 *  Inputs are truncated here rather than rejected: see `encode`. */
const MODEL_CONTEXT_TOKENS = 2048;

/** Where the model files live, when the host does not use the default cache.
 *
 *  Config rather than a constant: §10 requires weights not to be committed, so
 *  every host resolves them at runtime — Electron from `userData`, the CLI from
 *  `~/.bible`, the browser from its own cache. Absent means "use the library's
 *  default cache", which is the browser's case. */
export const modelCacheDir: Config.Config<Option.Option<string>> = Config.option(
  Config.String('BIBLE_MODEL_CACHE'),
);

/** `~/.bible/models`, beside the corpora both native hosts already resolve
 *  there — the CLI directly, Electron as a local source. Defined once here so
 *  "where a native host looks when `BIBLE_MODEL_CACHE` is unset" is one fact,
 *  not a per-host convention that can drift (§10's parity is a property of
 *  shared code, not of two copies agreeing). A fallback, not a default cache
 *  move: the env override still wins, and a host with no `HOME` — the browser,
 *  a bare service — reads as "no fallback" rather than failing. */
export const bibleHomeModelsFallback: Config.Config<Option.Option<string>> = Config.option(
  Config.String('HOME'),
).pipe(Config.map(Option.map((home) => `${home}/.bible/models`)));

/** The tokenizer and model this adapter drives, as narrowly as it uses them.
 *
 *  Declared structurally rather than imported as a type, because the import is
 *  dynamic: loading a 300M-parameter runtime at module scope would make every
 *  `bible` subcommand pay for it, including the ones that never search.
 *
 *  `sentence_embedding.data` is typed as `ArrayLike<number | bigint>` for the
 *  same reason the old code converted through `Number`: the library's
 *  `DataArray` union spans every dtype it can produce, including
 *  `BigInt64Array`. Under this adapter's pinned `fp32` the branch is never
 *  taken; the type is honest about what the library can return.
 */
interface LoadedModel {
  readonly encode: (
    texts: readonly string[],
  ) => Promise<{ readonly dims: readonly number[]; readonly data: ArrayLike<number | bigint> }>;
}

const unavailable = (adapter: string, reason: string): QueryEmbedderUnavailable =>
  QueryEmbedderUnavailable.make({ adapter, reason });

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

/** The lazy loader for the transformers.js runtime.
 *
 *  Dynamic so the runtime is paid for by the first search rather than by
 *  process start. The `noDynamicImports` rule guards against import graphs that
 *  hide dependencies; here the dependency is declared in `package.json`, the
 *  specifier is a literal, and the laziness is the point — which is why the
 *  loader is bound to this name rather than written inline.
 */
// oxlint-disable-next-line effect/noDynamicImports -- lazy by design; declared dependency, literal specifier
const loadTransformers = () => import('@huggingface/transformers');

/** Loads the tokenizer and model once, on the given device.
 *
 *  Every failure — no WebGPU, no model files, a corrupt download — becomes
 *  `QueryEmbedderUnavailable`. §10 requires "missing model -> EmbedderUnavailable,
 *  never a crash", and a search box that takes the app down because an optional
 *  model is not downloaded is the failure that rule exists to prevent.
 */
const loadModel = (
  adapter: string,
  device: EmbedderDevice,
  fallbackCacheDir: Config.Config<Option.Option<string>>,
): Effect.Effect<LoadedModel, QueryEmbedderUnavailable> =>
  Effect.gen(function* () {
    // A malformed or absent config reads as "no override" rather than as a
    // failure: the variable is an optional pointer at a model cache, and
    // refusing to search because it was unreadable would be a worse answer than
    // searching against the library's default cache. `BIBLE_MODEL_CACHE` wins
    // over the adapter's fallback, so one variable still overrides every host.
    const override = yield* Effect.orElseSucceed(modelCacheDir, () => Option.none<string>());
    const fallback = yield* Effect.orElseSucceed(fallbackCacheDir, () => Option.none<string>());
    const cache = Option.orElse(override, () => fallback);
    const module = yield* Effect.tryPromise({
      try: loadTransformers,
      catch: (cause) => unavailable(adapter, `transformers.js did not load: ${String(cause)}`),
    });
    const loaded = yield* Effect.tryPromise({
      // `Effect.tryPromise` takes a promise-returning thunk, so this async
      // function is the boundary the rule points at rather than a bypass of it:
      // transformers.js exposes only promise APIs, and the two `from_pretrained`
      // calls have to be sequenced before the pair can be returned.
      /* oxlint-disable effect/noAsyncFunction -- the promise thunk `Effect.tryPromise` requires */
      try: async () => {
        if (Option.isSome(cache)) module.env.cacheDir = cache.value;
        const tokenizer = await module.AutoTokenizer.from_pretrained(MODEL_ID);
        const model = await module.AutoModel.from_pretrained(MODEL_ID, {
          dtype: MODEL_DTYPE,
          device,
        });
        return { tokenizer, model };
      },
      /* oxlint-enable effect/noAsyncFunction */
      catch: (cause) => unavailable(adapter, `${MODEL_ID} on ${device}: ${String(cause)}`),
    });
    return {
      // Same boundary: `LoadedModel.encode` is declared as a promise because the
      // tokenizer and the model are, and its one caller wraps it in
      // `Effect.tryPromise`.
      /* oxlint-disable effect/noAsyncFunction -- transformers.js is promise-only */
      encode: async (texts) => {
        // Truncation at the model's context limit, because the corpus breaks
        // §9.2's "well under 900 tokens" assumption: a handful of EGW
        // paragraphs tokenize past 2048, and onnxruntime cannot grow the
        // rotary cos/sin cache mid-session — the full-corpus compile died on
        // exactly that node. A truncated document embedding is the standard
        // retrieval answer for over-long input; queries never come close.
        const inputs = await loaded.tokenizer([...texts], {
          padding: true,
          truncation: true,
          max_length: MODEL_CONTEXT_TOKENS,
        });
        const output = await loaded.model(inputs);
        // The trained retrieval head, not a mean pool over `last_hidden_state`.
        // The two agree at cosine 0.0081 on this corpus's text.
        const embedding = output.sentence_embedding;
        return { dims: embedding.dims, data: embedding.data };
      },
      /* oxlint-enable effect/noAsyncFunction */
    };
  });

/** One text's 768-d row out of a batch encode, as plain numbers. */
const rowOf = (
  encoded: { readonly dims: readonly number[]; readonly data: ArrayLike<number | bigint> },
  row: number,
): readonly number[] => {
  const width = encoded.dims[1] ?? 0;
  const out: number[] = [];
  for (let axis = 0; axis < width; axis += 1) out.push(Number(encoded.data[row * width + axis]));
  return out;
};

/** One embedder over one device.
 *
 *  The model is loaded lazily and memoized **on success only**: a host builds
 *  this layer at startup, and a reader who never searches should never pay for a
 *  300M-parameter model.
 *
 *  `Effect.cached` was wrong here. It caches the *result*, failures included and
 *  indefinitely, so a reader who searched once while the model was still
 *  downloading would get `EmbedderUnavailable` for the rest of the process's
 *  life — including after the download finished. A synchronized reference
 *  holding only successful loads gives the memoization without the trap: a typed
 *  load failure leaves the cell empty and the next query tries again.
 */
/** Memoizes a load **on success only**, under the cell's own lock.
 *
 *  Split out from the layer so the property can be tested without a
 *  300M-parameter model: what matters here is the caching discipline, and
 *  driving it through the real loader would make the test a download.
 *
 *  `SynchronizedRef.modifyEffect` holds the ref's semaphore for the duration of
 *  the update and **stores the new value only if the effect succeeds** — the two
 *  properties this needs. The lock means two concurrent first queries load one
 *  model rather than two, and a second in-flight load of a 300M-parameter graph
 *  would double the process's memory. The store-on-success-only means a typed
 *  load failure leaves the cell empty for the next query to retry.
 */
export const memoizeOnSuccess = <A, E>(
  load: Effect.Effect<A, E>,
): Effect.Effect<Effect.Effect<A, E>> =>
  Effect.map(SynchronizedRef.make(Option.none<A>()), (cell) =>
    SynchronizedRef.modifyEffect(
      cell,
      (current): Effect.Effect<readonly [A, Option.Option<A>], E> =>
        Option.match(current, {
          onSome: (value) => Effect.succeed([value, current]),
          onNone: () => Effect.map(load, (value) => [value, Option.some(value)]),
        }),
    ),
  );

export const layerTransformersEmbedder = (input: {
  readonly adapter: string;
  readonly device: EmbedderDevice;
  /** Where the model lives when `BIBLE_MODEL_CACHE` is not set — the host's
   *  own convention (the CLI's `~/.bible/models`). Absent means the library's
   *  default cache, which is the browser's case. */
  readonly fallbackCacheDir?: Config.Config<Option.Option<string>>;
}): Layer.Layer<QueryEmbedder> =>
  Layer.effect(
    QueryEmbedder,
    Effect.gen(function* () {
      /** The model, loaded at most once and retried after a typed failure. */
      const model = yield* memoizeOnSuccess(
        loadModel(
          input.adapter,
          input.device,
          input.fallbackCacheDir ?? Config.succeed(Option.none<string>()),
        ),
      );

      const embedWith =
        (prefix: string) =>
        (text: string): Effect.Effect<Int8Array, QueryEmbedderUnavailable> =>
          Effect.gen(function* () {
            const ready = yield* model;
            const encoded = yield* Effect.tryPromise({
              try: () => ready.encode([prefix + text]),
              catch: (cause) => unavailable(input.adapter, `embed failed: ${String(cause)}`),
            });
            // A row this build cannot use — too short, or carrying a non-finite
            // component — is an unavailable embedder rather than a padded
            // vector. `truncateToMrl` documents why silently repairing it is
            // the one outcome this path must never produce.
            const row = truncateToMrl(rowOf(encoded, 0));
            if (Option.isNone(row)) {
              return yield* unavailable(
                input.adapter,
                `${MODEL_ID} returned an unusable embedding row`,
              );
            }
            return quantize(row.value);
          });

      return QueryEmbedder.of({
        // The adapter reports the fingerprint it *loaded*, which is what makes
        // §10's mismatch detectable rather than assumed. It is the pinned
        // constant here because `MODEL_ID`, the dtype, the output name, the
        // prefixes and the quantization above are exactly what that constant
        // describes; an adapter differing in any of them would report another.
        fingerprint: MODEL_FINGERPRINT,
        embedQuery: embedWith(QUERY_PREFIX),
        embedDocument: embedWith(DOCUMENT_PREFIX),
      } satisfies QueryEmbedderApi);
    }),
  );
