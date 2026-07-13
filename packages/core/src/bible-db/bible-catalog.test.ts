import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, Layer, Option } from 'effect';

import { BibleCatalog } from './bible-catalog.js';
import { BibleDatabase } from './bible-database.js';

const files: string[] = [];

const run = <A, E>(effect: Effect.Effect<A, E, BibleCatalog | BibleDatabase>): Promise<A> => {
  const filename = join(tmpdir(), `bible-catalog-${crypto.randomUUID()}.sqlite`);
  files.push(filename);
  const layer = Layer.merge(BibleCatalog.layerCore, BibleDatabase.layerCore).pipe(
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

describe('BibleCatalog + BibleDatabase', () => {
  test('one unified schema supports imports and every renderer query shape', () =>
    run(
      Effect.gen(function* () {
        const catalog = yield* BibleCatalog;
        const database = yield* BibleDatabase;

        yield* catalog.importKjv(
          {
            verses: [
              { book_name: 'Genesis', book: 1, chapter: 1, verse: 1, text: 'In the beginning' },
              { book_name: 'Genesis', book: 1, chapter: 1, verse: 2, text: 'And the earth' },
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
        yield* catalog.importStrongsLexicon({
          H7225: { lemma: 'reshith', xlit: 'reshith', def: 'beginning' },
        });
        yield* catalog.importCrossReferences('openbible', {
          '1.1.1': { refs: [{ book: 43, chapter: 1, verse: 1 }] },
        });
        yield* catalog.importCrossReferences('tske', {
          '1.1.1': { refs: [{ book: 58, chapter: 1, verse: 1, verseEnd: 2 }] },
        });
        yield* catalog.importMarginNotes({
          '1.1.1': [{ type: 'hebrew', phrase: 'beginning', text: 'First in order' }],
        });
        yield* catalog.finalizeImport('2026-07-13T00:00:00.000Z');

        const chapter = yield* database.getChapter(1, 1);
        expect(chapter.map((verse) => verse.text)).toEqual(['In the beginning', 'And the earth']);
        const search = yield* database.searchVerses('beginning');
        expect(search.map((verse) => verse.verse)).toEqual([1]);

        const strongs = yield* database.getChapterStrongs(1, 1);
        expect(Option.getOrThrow(strongs).verses[0]?.words[1]?.strongs).toEqual(['H7225']);
        expect((yield* database.searchVersesByStrongs('h7225', null))[0]?.word).toBe('beginning');
        expect(yield* database.countStrongsOccurrences('H7225')).toBe(1);
        expect((yield* database.searchLexicon('begin', 10))[0]?.code).toBe('H7225');

        const crossReferences = yield* database.getCatalogCrossRefs(1, 1, 1);
        expect(crossReferences.map((reference) => reference.source)).toEqual(['openbible', 'tske']);
        expect(yield* database.versesWithCrossRefs(1, 1)).toEqual([1]);

        const notes = yield* database.getCatalogMarginNotes(1, 1, 1);
        expect(notes).toEqual([
          { idx: 0, type: 'hebrew', phrase: 'beginning', text: 'First in order' },
        ]);
        expect(Array.from(yield* database.versesWithNotes(1, 1))).toEqual([1]);
        expect((yield* database.chapterMarginNotes(1, 1)).get(1)).toEqual(notes);
      }),
    ));

  test('catalog re-import replaces source-owned rows instead of duplicating them', () =>
    run(
      Effect.gen(function* () {
        const catalog = yield* BibleCatalog;
        const database = yield* BibleDatabase;
        const xrefs = { '1.1.1': { refs: [{ book: 43, chapter: 3, verse: 16 }] } } as const;
        const notes = {
          '1.1.1': [{ type: 'other' as const, phrase: 'earth', text: 'world' }],
        };

        yield* catalog.importCrossReferences('openbible', xrefs);
        yield* catalog.importCrossReferences('openbible', xrefs);
        yield* catalog.importMarginNotes(notes);
        yield* catalog.importMarginNotes(notes);

        expect((yield* database.getCatalogCrossRefs(1, 1, 1)).length).toBe(1);
        expect((yield* database.getCatalogMarginNotes(1, 1, 1)).length).toBe(1);
      }),
    ));
});
