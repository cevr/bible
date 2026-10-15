/**
 * The query embedder on a Worker: EmbeddingGemma through Workers AI.
 *
 * The Bun server runs the ONNX graph in process; a Worker cannot hold the
 * model, so it asks Workers AI for `@cf/google/embeddinggemma-300m` and applies
 * the same contract to its answer: the same prefixes, the same 256-d MRL
 * truncation, the same int8 quantization (`@bible/core/search`'s
 * `embedding.ts`).
 *
 * **Measured, not assumed, to match the index.** Fifty corpus paragraphs
 * embedded here under `DOCUMENT_PREFIX` came back identical to their stored
 * `vectors.bvi` rows: cosine 1.00000, no int8 component off by one. So this
 * adapter declares `MODEL_FINGERPRINT`, the fingerprint the index was built
 * under, and the search's fingerprint check holds — and the weekly sync
 * embeds a new book's paragraphs here (`workersAiDocuments`), into the same
 * index, under the same fingerprint.
 */

import { Array as Arr, Effect, Option, Schema } from 'effect';

import {
  DOCUMENT_PREFIX,
  MODEL_FINGERPRINT,
  QUERY_PREFIX,
  type QueryEmbedderApi,
  QueryEmbedderUnavailable,
  quantize,
  truncateToMrl,
} from '@bible/core/search';

/** The Workers AI model the fingerprint names. */
export const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m';

const ADAPTER = 'workers-ai';

/** What the model answers: one 768-d embedding per input text. */
const EmbeddingOutput = Schema.Struct({
  data: Schema.Array(Schema.Array(Schema.Finite)),
});

const unavailable = (reason: string) => QueryEmbedderUnavailable.make({ adapter: ADAPTER, reason });

/** The most texts the model takes in one call (its input schema's
 *  `maxItems`). */
export const EMBEDDING_BATCH = 100;

/** The binding's call for `EMBEDDING_MODEL`. */
type Run<E> = (inputs: { readonly text: string[] }) => Effect.Effect<unknown, E>;

/** The index's vectors for `texts`, already prefixed, in one call. */
const embedBatch =
  <E>(run: Run<E>) =>
  (texts: readonly string[]) =>
    run({ text: [...texts] }).pipe(
      Effect.mapError((cause) => unavailable(String(cause))),
      Effect.flatMap((output) =>
        Schema.decodeUnknownEffect(EmbeddingOutput)(output).pipe(
          Effect.mapError((issue) => unavailable(`unexpected output: ${String(issue)}`)),
        ),
      ),
      Effect.flatMap((output) => {
        if (output.data.length !== texts.length) {
          return Effect.fail(
            unavailable(
              `asked for ${String(texts.length)} embeddings, got ${String(output.data.length)}`,
            ),
          );
        }
        return Effect.forEach(output.data, (values) =>
          Option.match(truncateToMrl(values), {
            onNone: () => Effect.fail(unavailable('no usable 256-d embedding in the output')),
            onSome: (truncated) => Effect.succeed(quantize(truncated)),
          }),
        );
      }),
    );

/** Embeds through `run`, the Workers AI binding's call for `EMBEDDING_MODEL`. */
export const workersAiEmbedder = <E>(run: Run<E>): QueryEmbedderApi => {
  const embed = (prefix: string) => (text: string) =>
    embedBatch(run)([`${prefix}${text}`]).pipe(
      Effect.flatMap((vectors) =>
        Effect.fromOption(Arr.head(vectors)).pipe(
          Effect.mapError(() => unavailable('no usable 256-d embedding in the output')),
        ),
      ),
    );
  return {
    fingerprint: MODEL_FINGERPRINT,
    embedQuery: embed(QUERY_PREFIX),
    embedDocument: embed(DOCUMENT_PREFIX),
  };
};

/** Documents' vectors through `run`, in order: each text under the document
 *  prefix, `EMBEDDING_BATCH` to a call. */
export const workersAiDocuments =
  <E>(run: Run<E>) =>
  (texts: readonly string[]): Effect.Effect<readonly Int8Array[], QueryEmbedderUnavailable> =>
    Effect.forEach(Arr.chunksOf(texts, EMBEDDING_BATCH), (batch) =>
      embedBatch(run)(batch.map((text) => `${DOCUMENT_PREFIX}${text}`)),
    ).pipe(Effect.map(Arr.flatten));
