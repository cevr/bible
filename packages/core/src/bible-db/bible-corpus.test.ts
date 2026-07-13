import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, Layer, Option } from 'effect';

import { BibleCorpus } from './bible-corpus.js';
import { BibleDatabase } from './bible-database.js';

const files: string[] = [];

const run = <A, E>(effect: Effect.Effect<A, E, BibleCorpus | BibleDatabase>): Promise<A> => {
  const filename = join(tmpdir(), `bible-corpus-${crypto.randomUUID()}.sqlite`);
  files.push(filename);
  const layer = Layer.merge(BibleCorpus.layer, BibleDatabase.layer).pipe(
    Layer.provide(SqliteBun.layer({ filename })),
  );
  return Effect.runPromise(Effect.scoped(effect.pipe(Effect.provide(layer))));
};

afterAll(() => {
  for (const filename of files) {
    for (const suffix of ['', '-wal', '-shm']) {
      const candidate = `${filename}${suffix}`;
      if (existsSync(candidate)) unlinkSync(candidate);
    }
  }
});

describe('BibleCorpus + BibleDatabase', () => {
  test('one unified schema supports imports and the canonical query interface', () =>
    run(
      Effect.gen(function* () {
        const corpus = yield* BibleCorpus;
        const database = yield* BibleDatabase;

        yield* corpus.importKjv(
          {
            verses: [
              {
                book_name: 'Genesis',
                book: 1,
                chapter: 1,
                verse: 1,
                text: 'In the beginning',
              },
              {
                book_name: 'Genesis',
                book: 1,
                chapter: 1,
                verse: 2,
                text: 'And the earth',
              },
              {
                book_name: 'Exodus',
                book: 2,
                chapter: 1,
                verse: 1,
                text: 'A new beginning',
              },
            ],
          },
          [
            {
              book: 1,
              chapter: 1,
              verse: 1,
              words: [{ text: 'In' }, { text: 'beginning', strongs: ['H7225'] }],
            },
          ],
        );
        yield* corpus.importStrongsLexicon({
          H7225: { lemma: 'reshith', xlit: 'reshith', def: 'beginning' },
        });
        yield* corpus.importCrossReferences('openbible', {
          '1.1.1': { refs: [{ book: 43, chapter: 1, verse: 1 }] },
        });
        yield* corpus.importCrossReferences('tske', {
          '1.1.1': { refs: [{ book: 58, chapter: 1, verse: 1, verseEnd: 2 }] },
        });
        yield* corpus.importMarginNotes({
          '1.1.1': [{ type: 'hebrew', phrase: 'beginning', text: 'First in order' }],
        });
        yield* corpus.finalizeImport('2026-07-13T00:00:00.000Z');

        const chapter = yield* database.getChapter(1, 1);
        expect(chapter.map((verse) => verse.text)).toEqual(['In the beginning', 'And the earth']);
        const search = yield* database.searchVerseWindow('beginning');
        expect(search.results).toHaveLength(2);
        expect(search.total).toBe(2);

        const filteredSearch = yield* database.searchVerseWindow('beginning', {
          books: [2],
          limit: 1,
        });
        expect(filteredSearch.results.map((verse) => verse.book)).toEqual([2]);
        expect(filteredSearch.total).toBe(1);

        const secondSearchResult = yield* database.searchVerseWindow('beginning', {
          offset: 1,
          limit: 1,
        });
        expect(secondSearchResult.results).toHaveLength(1);
        expect(secondSearchResult.total).toBe(2);

        const strongs = yield* database.getChapterStrongs(1, 1);
        expect(Option.getOrThrow(strongs).verses[0]?.words[1]?.strongsNumbers).toEqual(['H7225']);
        expect((yield* database.getVersesWithStrongs('h7225'))[0]?.word).toBe('beginning');
        expect(yield* database.getStrongsCount('H7225')).toBe(1);
        expect((yield* database.searchStrongs('begin', 10))[0]?.number).toBe('H7225');

        const crossReferences = yield* database.getCrossRefs(1, 1, 1);
        expect(crossReferences.map((reference) => reference.source)).toEqual(['openbible', 'tske']);
        expect(Array.from(yield* database.versesWithCrossRefs(1, 1))).toEqual([1]);

        const notes = yield* database.getMarginNotes(1, 1, 1);
        expect(notes).toEqual([
          {
            index: 0,
            type: 'hebrew',
            phrase: 'beginning',
            text: 'First in order',
          },
        ]);
        expect(Array.from(yield* database.versesWithNotes(1, 1))).toEqual([1]);
        expect((yield* database.chapterMarginNotes(1, 1)).get(1)).toEqual(notes);
      }),
    ));

  test('corpus re-import replaces source-owned rows instead of duplicating them', () =>
    run(
      Effect.gen(function* () {
        const corpus = yield* BibleCorpus;
        const database = yield* BibleDatabase;
        const xrefs = {
          '1.1.1': { refs: [{ book: 43, chapter: 3, verse: 16 }] },
        } as const;
        const notes = {
          '1.1.1': [{ type: 'other' as const, phrase: 'earth', text: 'world' }],
        };

        yield* corpus.importCrossReferences('openbible', xrefs);
        yield* corpus.importCrossReferences('openbible', xrefs);
        yield* corpus.importMarginNotes(notes);
        yield* corpus.importMarginNotes(notes);

        expect((yield* database.getCrossRefs(1, 1, 1)).length).toBe(1);
        expect((yield* database.getMarginNotes(1, 1, 1)).length).toBe(1);
      }),
    ));
});
