import { describe, expect, test } from 'bun:test';
import { Effect, Result } from 'effect';

import { decodeBibleCorpusArchive } from './archive.js';

describe('BibleCorpusArchive', () => {
  test('rejects malformed source coordinates before installation', async () => {
    const decoded = await Effect.runPromise(
      Effect.result(
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
      ),
    );

    expect(Result.isFailure(decoded)).toBe(true);
  });
});
