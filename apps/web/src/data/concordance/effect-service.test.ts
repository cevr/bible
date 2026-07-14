import { BibleDatabase } from '@bible/core/bible-db';
import { describe, expect, test } from 'bun:test';
import { Effect, Layer, Option } from 'effect';

import { ConcordanceService } from './effect-service';

const database = BibleDatabase.layerTest({
  strongsEntries: [
    {
      number: 'H7225',
      language: 'hebrew',
      lemma: 'reshith',
      transliteration: 'reshith',
      pronunciation: null,
      definition: 'beginning',
      kjvDefinition: null,
    },
  ],
  verseWords: [
    {
      book: 1,
      chapter: 1,
      verse: 1,
      words: [
        { text: 'In', strongsNumbers: [], italic: true },
        { text: 'beginning', strongsNumbers: ['H7225'], italic: false },
      ],
    },
  ],
  marginNotes: [
    {
      book: 1,
      chapter: 1,
      verse: 1,
      notes: [{ index: 0, type: 'hebrew', phrase: 'beginning', text: 'First in order' }],
    },
  ],
  concordanceHits: {
    H7225: [
      {
        book: 1,
        bookName: 'Genesis',
        chapter: 1,
        verse: 1,
        text: 'In the beginning',
        word: 'beginning',
      },
    ],
  },
});

const layer = ConcordanceService.layer.pipe(Layer.provide(database));

const run = <A>(effect: Effect.Effect<A, unknown, ConcordanceService>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(layer)));

describe('ConcordanceService canonical Bible adapter', () => {
  test('projects the canonical database interface into the stable web model', async () => {
    const result = await run(
      Effect.gen(function* () {
        const concordance = yield* ConcordanceService;
        return {
          entry: yield* concordance.getStrongsEntry('H7225'),
          words: yield* concordance.getVerseWords(1, 1, 1),
          notes: yield* concordance.getMarginNotes(1, 1, 1),
          chapterNotes: yield* concordance.getChapterMarginNotes(1, 1),
          hits: yield* concordance.searchByStrongs('H7225'),
        };
      }),
    );

    expect(Option.fromNullishOr(result.entry)._tag).toBe('Some');
    expect(result.words).toEqual([
      { wordIndex: 0, wordText: 'In', strongsNumbers: null, italic: true },
      { wordIndex: 1, wordText: 'beginning', strongsNumbers: ['H7225'], italic: false },
    ]);
    expect(result.notes).toEqual([
      { noteIndex: 0, noteType: 'hebrew', phrase: 'beginning', noteText: 'First in order' },
    ]);
    expect(result.chapterNotes.get(1)).toEqual(result.notes);
    expect(result.hits).toEqual([{ book: 1, chapter: 1, verse: 1, wordText: 'beginning' }]);
  });
});
