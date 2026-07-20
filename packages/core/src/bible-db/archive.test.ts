import { describe, expect, it } from 'effect-bun-test';
import { Effect, Result } from 'effect';

import { decodeBibleCorpusArchive } from './archive.js';

describe('BibleCorpusArchive', () => {
  const test = it.effect;

  test('rejects malformed source coordinates before installation', () =>
    Effect.gen(function* () {
      const decoded = yield* Effect.result(
        decodeBibleCorpusArchive({
          kjv: {
            verses: [{ book_name: 'Genesis', book: 0, chapter: 1, verse: 1, text: 'invalid' }],
          },
          strongsVerses: [],
          strongsLexicon: {},
          openBibleCrossReferences: {},
          tskeCrossReferences: {},
          marginNotes: {},
          topics: {
            meta: {
              id: 'topics',
              title: 'Topics',
              license: 'public-domain',
              provenance: { source_url: 'https://example.test', source_hash: 'sha256:test' },
            },
            data: [],
          },
        }),
      );

      expect(Result.isFailure(decoded)).toBe(true);
    }));
});
