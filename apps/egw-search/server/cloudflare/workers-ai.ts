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
 * under, and the search's fingerprint check holds.
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

/** Embeds through `run`, the Workers AI binding's call for `EMBEDDING_MODEL`. */
export const workersAiEmbedder = <E>(
  run: (inputs: { readonly text: string[] }) => Effect.Effect<unknown, E>,
): QueryEmbedderApi => {
  const embed = (prefix: string) => (text: string) =>
    run({ text: [`${prefix}${text}`] }).pipe(
      Effect.mapError((cause) => unavailable(String(cause))),
      Effect.flatMap((output) =>
        Schema.decodeUnknownEffect(EmbeddingOutput)(output).pipe(
          Effect.mapError((issue) => unavailable(`unexpected output: ${String(issue)}`)),
        ),
      ),
      Effect.flatMap((output) =>
        Option.match(Option.flatMap(Arr.head(output.data), truncateToMrl), {
          onNone: () => Effect.fail(unavailable('no usable 256-d embedding in the output')),
          onSome: (values) => Effect.succeed(quantize(values)),
        }),
      ),
    );
  return {
    fingerprint: MODEL_FINGERPRINT,
    embedQuery: embed(QUERY_PREFIX),
    embedDocument: embed(DOCUMENT_PREFIX),
  };
};
