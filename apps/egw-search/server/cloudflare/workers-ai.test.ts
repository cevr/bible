import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import {
  DIMENSIONS,
  DOCUMENT_PREFIX,
  MODEL_FINGERPRINT,
  QUERY_PREFIX,
  quantize,
  truncateToMrl,
} from '@bible/core/search';

import { EMBEDDING_BATCH, workersAiDocuments, workersAiEmbedder } from './workers-ai.ts';

/** A 768-d answer whose first 256 components are not already unit length. */
const full = Array.from({ length: 768 }, (_, i) => Math.sin(i + 1));

describe('workersAiEmbedder', () => {
  test('prefixes the text and applies the index contract to the answer', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const asked: string[][] = [];
        const embedder = workersAiEmbedder((inputs) => {
          asked.push(inputs.text);
          return Effect.succeed({ data: [full] });
        });
        const query = yield* embedder.embedQuery('grace');
        yield* embedder.embedDocument('grace');
        expect(asked).toEqual([[`${QUERY_PREFIX}grace`], [`${DOCUMENT_PREFIX}grace`]]);
        expect(query.length).toBe(DIMENSIONS);
        const expected = truncateToMrl(full);
        expect(expected._tag).toBe('Some');
        if (expected._tag === 'Some') expect(query).toEqual(quantize(expected.value));
        expect(embedder.fingerprint).toBe(MODEL_FINGERPRINT);
      }),
    ));

  test('a failed call, an odd answer and a short embedding are all unavailable', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const answers = [
          Effect.fail('down'),
          Effect.succeed({ data: 'nope' }),
          Effect.succeed({ data: [[0.1, 0.2]] }),
          Effect.succeed({ data: [] }),
        ];
        for (const answer of answers) {
          const failure = yield* Effect.flip(workersAiEmbedder(() => answer).embedQuery('x'));
          expect(failure._tag).toBe('Search/QueryEmbedderUnavailable');
          expect(failure.adapter).toBe('workers-ai');
        }
      }),
    ));
});

describe('workersAiDocuments', () => {
  test('embeds documents under the document prefix, a batch to a call, in order', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const asked: string[][] = [];
        const texts = Array.from({ length: EMBEDDING_BATCH + 1 }, (_, i) => `p${String(i)}`);
        const vectors = yield* workersAiDocuments((inputs) => {
          asked.push(inputs.text);
          return Effect.succeed({ data: inputs.text.map(() => full) });
        })(texts);
        expect(asked.map((batch) => batch.length)).toEqual([EMBEDDING_BATCH, 1]);
        expect(asked[1]).toEqual([`${DOCUMENT_PREFIX}p${String(EMBEDDING_BATCH)}`]);
        expect(vectors).toHaveLength(EMBEDDING_BATCH + 1);
      }),
    ));

  test('an answer with fewer embeddings than texts is unavailable', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          workersAiDocuments(() => Effect.succeed({ data: [full] }))(['a', 'b']),
        );
        expect(failure._tag).toBe('Search/QueryEmbedderUnavailable');
      }),
    ));
});
