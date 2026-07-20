import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { Effect, Layer, Option, Result, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import { BibleCorpus } from './bible-corpus.js';
import { BibleDatabase } from './bible-database.js';
import { BibleCorpusArchive } from './archive.js';
import { TopicId } from '../topics/model.js';
import { TopicService } from '../topics/service.js';

const withTempDatabase = <A, E>(
  prefix: string,
  use: (filename: string) => Effect.Effect<A, E>,
): Promise<A> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.flatMap(
        Effect.acquireRelease(
          Effect.sync(() => join(tmpdir(), `${prefix}-${crypto.randomUUID()}.sqlite`)),
          (filename) =>
            Effect.sync(() => {
              for (const suffix of ['', '-wal', '-shm']) {
                const candidate = `${filename}${suffix}`;
                if (existsSync(candidate)) unlinkSync(candidate);
              }
            }),
        ),
        use,
      ),
    ),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, BibleCorpus | BibleDatabase | TopicService>,
): Promise<A> => {
  return withTempDatabase('bible-corpus', (filename) => {
    const layer = Layer.mergeAll(BibleCorpus.layer, BibleDatabase.layer, TopicService.Live).pipe(
      Layer.provide(SqliteBun.layer({ filename })),
    );
    return effect.pipe(Effect.provide(layer), Effect.scoped);
  });
};

const archive = (): BibleCorpusArchive =>
  new BibleCorpusArchive({
    kjv: {
      verses: [
        { book_name: 'Genesis', book: 1, chapter: 1, verse: 1, text: 'In the beginning' },
        { book_name: 'Genesis', book: 1, chapter: 1, verse: 2, text: 'And the earth' },
        { book_name: 'Exodus', book: 2, chapter: 1, verse: 1, text: 'A new beginning' },
      ],
    },
    strongsVerses: [
      {
        book: 1,
        chapter: 1,
        verse: 1,
        words: [
          { text: 'In', italic: true },
          { text: 'beginning', strongs: ['H7225'] },
        ],
      },
    ],
    strongsLexicon: {
      H7225: { lemma: 'reshith', xlit: 'reshith', def: 'beginning' },
    },
    openBibleCrossReferences: {
      '1.1.1': { refs: [{ book: 43, chapter: 1, verse: 1 }] },
    },
    tskeCrossReferences: {
      '1.1.1': { refs: [{ book: 58, chapter: 1, verse: 1, verseEnd: 2 }] },
    },
    marginNotes: {
      '1.1.1': [{ type: 'hebrew', phrase: 'beginning', text: 'First in order' }],
    },
    topics: {
      meta: {
        id: 'naves-topical-bible',
        title: "Nave's Topical Bible",
        license: 'public-domain',
        provenance: {
          source_url: 'https://example.test/naves',
          source_hash: `sha256:${'a'.repeat(64)}`,
        },
      },
      data: [
        {
          entry_id: 'naves-topical-bible.creation',
          topic: 'CREATION',
          alt_topics: ['Beginning'],
          subtopics: [
            {
              label: 'The beginning',
              references: [{ raw: 'Ge 1:1', osis: ['Gen.1.1'] }],
            },
          ],
        },
      ],
    },
  });

describe('BibleCorpus + BibleDatabase', () => {
  test('one unified schema supports imports and the canonical query interface', () =>
    run(
      Effect.gen(function* () {
        const corpus = yield* BibleCorpus;
        const database = yield* BibleDatabase;

        const installed = yield* corpus.install(archive(), '2026-07-13T00:00:00.000Z');

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
        expect(Option.getOrThrow(strongs).verses[0]?.words[0]?.italic).toBe(true);
        expect(Option.getOrThrow(strongs).verses[0]?.words[1]?.strongsNumbers).toEqual(['H7225']);
        expect((yield* database.getVerseWords(1, 1, 1))[0]?.italic).toBe(true);
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

        const topics = yield* TopicService;
        expect((yield* topics.list({ query: 'creation' }))[0]?.name).toBe('CREATION');
        const topic = yield* topics.topic(
          Schema.decodeUnknownSync(TopicId)('naves-topical-bible.creation'),
        );
        expect(topic.sections[0]?.references[0]?.osis).toEqual(['Gen.1.1']);
        expect(installed.topics).toEqual({ topics: 1, sections: 1, references: 1 });
      }),
    ));

  test('corpus re-import replaces source-owned rows instead of duplicating them', () =>
    run(
      Effect.gen(function* () {
        const corpus = yield* BibleCorpus;
        const database = yield* BibleDatabase;
        yield* corpus.install(archive(), '2026-07-13T00:00:00.000Z');
        yield* corpus.install(archive(), '2026-07-14T00:00:00.000Z');

        expect((yield* database.getCrossRefs(1, 1, 1)).length).toBe(2);
        expect((yield* database.getMarginNotes(1, 1, 1)).length).toBe(1);
      }),
    ));

  test('rolls back the complete installation when one contribution cannot be stored', () =>
    run(
      Effect.gen(function* () {
        const corpus = yield* BibleCorpus;
        const database = yield* BibleDatabase;
        const valid = archive();
        const topic = valid.topics.data[0];
        if (topic === undefined) throw new Error('test topic is missing');
        const invalid = new BibleCorpusArchive({
          kjv: valid.kjv,
          strongsVerses: valid.strongsVerses,
          strongsLexicon: valid.strongsLexicon,
          openBibleCrossReferences: valid.openBibleCrossReferences,
          tskeCrossReferences: valid.tskeCrossReferences,
          marginNotes: valid.marginNotes,
          topics: {
            meta: valid.topics.meta,
            data: [topic, topic],
          },
        });

        const installed = yield* Effect.result(corpus.install(invalid, '2026-07-13T00:00:00.000Z'));

        expect(Result.isFailure(installed)).toBe(true);
        expect(yield* database.getChapter(1, 1)).toEqual([]);
      }),
    ));

  test('readonly query interface treats legacy word rows as non-italic', () => {
    return withTempDatabase('bible-legacy', (filename) => {
      const layer = BibleDatabase.layer.pipe(Layer.provideMerge(SqliteBun.layer({ filename })));
      return Effect.scoped(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const database = yield* BibleDatabase;
          yield* sql`
            CREATE TABLE verse_words (
              book INTEGER NOT NULL,
              chapter INTEGER NOT NULL,
              verse INTEGER NOT NULL,
              word_index INTEGER NOT NULL,
              word_text TEXT NOT NULL,
              strongs_numbers TEXT
            )
          `;
          yield* sql`
            INSERT INTO verse_words VALUES (1, 1, 1, 0, 'Beginning', '["H7225"]')
          `;

          expect(yield* database.getVerseWords(1, 1, 1)).toEqual([
            { text: 'Beginning', strongsNumbers: ['H7225'], italic: false },
          ]);
        }).pipe(Effect.provide(layer)),
      );
    });
  });

  test('corpus initialization migrates an existing word table to preserve italics', () => {
    return withTempDatabase('bible-migration', (filename) => {
      const initializeLegacy = Effect.sync(() => {
        const legacy = new Database(filename);
        legacy.exec(`
      CREATE TABLE verse_words (
        book INTEGER NOT NULL,
        chapter INTEGER NOT NULL,
        verse INTEGER NOT NULL,
        word_index INTEGER NOT NULL,
        word_text TEXT NOT NULL,
        strongs_numbers TEXT,
        PRIMARY KEY (book, chapter, verse, word_index)
      )
    `);
        legacy.close();
      });
      const layer = BibleCorpus.layer.pipe(Layer.provideMerge(SqliteBun.layer({ filename })));
      return Effect.andThen(
        initializeLegacy,
        Effect.scoped(
          Effect.gen(function* () {
            yield* BibleCorpus;
            const sql = yield* SqlClient.SqlClient;
            const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(verse_words)`;
            expect(columns.map((column) => column.name)).toContain('italic');
          }).pipe(Effect.provide(layer)),
        ),
      );
    });
  });
});
