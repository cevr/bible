/**
 * Driver-agnostic query service for the unified Bible database.
 *
 * The schema is also consumed directly by the browser SQLite worker, so this
 * module owns the canonical query contract while platform modules provide a
 * concrete Effect SQL driver.
 */

import { Context, Effect, Layer, Option, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';

export class BibleDataIntegrityError extends Schema.TaggedErrorClass<BibleDataIntegrityError>()(
  'BibleDataIntegrityError',
  {
    cause: Schema.Unknown,
    location: Schema.String,
  },
) {}

export type BibleDatabaseError = SqlError | BibleDataIntegrityError;

export interface BibleBook {
  readonly number: number;
  readonly name: string;
  readonly abbreviation: string;
  readonly testament: 'old' | 'new';
  readonly chapters: number;
}

export interface BibleVerse {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
  readonly versionCode: string;
}

export interface CrossReference {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number | null;
  readonly verseEnd: number | null;
  readonly source: 'openbible' | 'tske';
  readonly previewText: string | null;
}

export interface StrongsEntry {
  readonly number: string;
  readonly language: 'hebrew' | 'greek';
  readonly lemma: string;
  readonly transliteration: string | null;
  readonly pronunciation: string | null;
  readonly definition: string;
  readonly kjvDefinition: string | null;
}

export interface VerseWord {
  readonly text: string;
  readonly strongsNumbers: readonly string[] | null;
}

export interface MarginNote {
  readonly type: 'hebrew' | 'greek' | 'alternate' | 'name' | 'other';
  readonly phrase: string;
  readonly text: string;
}

export interface ConcordanceResult {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly word: string | null;
}

export interface VerseSearchResult extends BibleVerse {}

export interface BibleDatabaseService {
  readonly getBooks: () => Effect.Effect<readonly BibleBook[], BibleDatabaseError>;
  readonly getBook: (
    bookNum: number,
  ) => Effect.Effect<Option.Option<BibleBook>, BibleDatabaseError>;
  readonly getChapter: (
    book: number,
    chapter: number,
    versionCode?: string,
  ) => Effect.Effect<readonly BibleVerse[], BibleDatabaseError>;
  readonly getVerse: (
    book: number,
    chapter: number,
    verse: number,
    versionCode?: string,
  ) => Effect.Effect<Option.Option<BibleVerse>, BibleDatabaseError>;
  readonly searchVerses: (
    query: string,
    limit?: number,
    versionCode?: string,
  ) => Effect.Effect<readonly VerseSearchResult[], BibleDatabaseError>;
  readonly getCrossRefs: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly CrossReference[], BibleDatabaseError>;
  readonly getStrongsEntry: (
    number: string,
  ) => Effect.Effect<Option.Option<StrongsEntry>, BibleDatabaseError>;
  readonly searchStrongs: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly StrongsEntry[], BibleDatabaseError>;
  readonly getVersesWithStrongs: (
    strongsNumber: string,
  ) => Effect.Effect<readonly ConcordanceResult[], BibleDatabaseError>;
  readonly getStrongsCount: (strongsNumber: string) => Effect.Effect<number, BibleDatabaseError>;
  readonly getVerseWords: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly VerseWord[], BibleDatabaseError>;
  readonly hasStrongsMapping: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<boolean, BibleDatabaseError>;
  readonly getMarginNotes: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly MarginNote[], BibleDatabaseError>;
}

interface BookSqlRow {
  readonly number: number;
  readonly name: string;
  readonly abbreviation: string;
  readonly testament: string;
  readonly chapters: number;
}

interface VerseSqlRow {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly version_code: string;
  readonly text: string;
}

interface CrossRefSqlRow {
  readonly ref_book: number;
  readonly ref_chapter: number;
  readonly ref_verse: number | null;
  readonly ref_verse_end: number | null;
  readonly source: string;
  readonly preview_text: string | null;
}

interface StrongsSqlRow {
  readonly number: string;
  readonly language: string;
  readonly lemma: string;
  readonly transliteration: string | null;
  readonly pronunciation: string | null;
  readonly definition: string;
  readonly kjv_definition: string | null;
}

interface VerseWordSqlRow {
  readonly word_text: string;
  readonly strongs_numbers: string | null;
}

interface ConcordanceSqlRow {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly word_text: string | null;
}

interface MarginNoteSqlRow {
  readonly note_type: string;
  readonly phrase: string;
  readonly note_text: string;
}

const StrongsNumbersJson = Schema.fromJsonString(Schema.Array(Schema.String));
const decodeStrongsNumbers = Schema.decodeUnknownSync(StrongsNumbersJson);

const bibleBook = (row: BookSqlRow): BibleBook => ({
  number: row.number,
  name: row.name,
  abbreviation: row.abbreviation,
  testament: row.testament === 'new' ? 'new' : 'old',
  chapters: row.chapters,
});

const bibleVerse = (row: VerseSqlRow): BibleVerse => ({
  book: row.book,
  chapter: row.chapter,
  verse: row.verse,
  text: row.text,
  versionCode: row.version_code,
});

const strongsEntry = (row: StrongsSqlRow): StrongsEntry => ({
  number: row.number,
  language: row.language === 'greek' ? 'greek' : 'hebrew',
  lemma: row.lemma,
  transliteration: row.transliteration,
  pronunciation: row.pronunciation,
  definition: row.definition,
  kjvDefinition: row.kjv_definition,
});

const marginNoteType = (value: string): MarginNote['type'] => {
  switch (value) {
    case 'hebrew':
    case 'greek':
    case 'alternate':
    case 'name':
      return value;
    default:
      return 'other';
  }
};

export class BibleDatabase extends Context.Service<BibleDatabase, BibleDatabaseService>()(
  '@bible/core/bible-db/BibleDatabase',
) {
  static layerCore: Layer.Layer<BibleDatabase, never, SqlClient.SqlClient> = Layer.effect(
    BibleDatabase,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const getBooks = () =>
        sql<BookSqlRow>`
          SELECT number, name, abbreviation, testament, chapters
          FROM books
          ORDER BY number
        `.pipe(Effect.map((rows) => rows.map(bibleBook)));

      const getBook = (bookNum: number) =>
        sql<BookSqlRow>`
          SELECT number, name, abbreviation, testament, chapters
          FROM books
          WHERE number = ${bookNum}
        `.pipe(Effect.map((rows) => Option.fromNullishOr(rows[0]).pipe(Option.map(bibleBook))));

      const getChapter = (book: number, chapter: number, versionCode = 'KJV') =>
        sql<VerseSqlRow>`
          SELECT book, chapter, verse, version_code, text
          FROM verses
          WHERE version_code = ${versionCode} AND book = ${book} AND chapter = ${chapter}
          ORDER BY verse
        `.pipe(Effect.map((rows) => rows.map(bibleVerse)));

      const getVerse = (book: number, chapter: number, verse: number, versionCode = 'KJV') =>
        sql<VerseSqlRow>`
          SELECT book, chapter, verse, version_code, text
          FROM verses
          WHERE version_code = ${versionCode}
            AND book = ${book}
            AND chapter = ${chapter}
            AND verse = ${verse}
        `.pipe(Effect.map((rows) => Option.fromNullishOr(rows[0]).pipe(Option.map(bibleVerse))));

      const searchVerses = (query: string, limit = 50, versionCode = 'KJV') => {
        const escaped = query.replace(/['"*]/g, '').trim();
        if (escaped.length === 0) return Effect.succeed<readonly VerseSearchResult[]>([]);
        return sql<VerseSqlRow>`
          SELECT v.book, v.chapter, v.verse, v.version_code, v.text
          FROM verses AS v
          JOIN verses_fts AS fts ON v.rowid = fts.rowid
          WHERE verses_fts MATCH ${`"${escaped}"`} AND v.version_code = ${versionCode}
          LIMIT ${limit}
        `.pipe(Effect.map((rows) => rows.map(bibleVerse)));
      };

      const getCrossRefs = (book: number, chapter: number, verse: number) =>
        sql<CrossRefSqlRow>`
          SELECT ref_book, ref_chapter, ref_verse, ref_verse_end, source, preview_text
          FROM cross_refs
          WHERE book = ${book} AND chapter = ${chapter} AND verse = ${verse}
        `.pipe(
          Effect.map((rows) =>
            rows.map(
              (row): CrossReference => ({
                book: row.ref_book,
                chapter: row.ref_chapter,
                verse: row.ref_verse,
                verseEnd: row.ref_verse_end,
                source: row.source === 'tske' ? 'tske' : 'openbible',
                previewText: row.preview_text,
              }),
            ),
          ),
        );

      const getStrongsEntry = (number: string) =>
        sql<StrongsSqlRow>`
          SELECT number, language, lemma, transliteration, pronunciation, definition, kjv_definition
          FROM strongs
          WHERE number = ${number.toUpperCase()}
        `.pipe(Effect.map((rows) => Option.fromNullishOr(rows[0]).pipe(Option.map(strongsEntry))));

      const searchStrongs = (query: string, limit = 50) => {
        const escaped = query.replace(/['"*]/g, '').trim();
        if (escaped.length === 0) return Effect.succeed<readonly StrongsEntry[]>([]);
        return sql<StrongsSqlRow>`
          SELECT s.number, s.language, s.lemma, s.transliteration,
                 s.pronunciation, s.definition, s.kjv_definition
          FROM strongs AS s
          JOIN strongs_fts AS fts ON s.rowid = fts.rowid
          WHERE strongs_fts MATCH ${`"${escaped}"`}
          LIMIT ${limit}
        `.pipe(Effect.map((rows) => rows.map(strongsEntry)));
      };

      const getVersesWithStrongs = (strongsNumber: string) =>
        sql<ConcordanceSqlRow>`
          SELECT DISTINCT book, chapter, verse, word_text
          FROM strongs_verses
          WHERE strongs_number = ${strongsNumber.toUpperCase()}
          ORDER BY book, chapter, verse
        `.pipe(
          Effect.map((rows) =>
            rows.map((row) => ({
              book: row.book,
              chapter: row.chapter,
              verse: row.verse,
              word: row.word_text,
            })),
          ),
        );

      const getStrongsCount = (strongsNumber: string) =>
        sql<{ readonly count: number }>`
          SELECT COUNT(DISTINCT book || '.' || chapter || '.' || verse) AS count
          FROM strongs_verses
          WHERE strongs_number = ${strongsNumber.toUpperCase()}
        `.pipe(Effect.map((rows) => rows[0]?.count ?? 0));

      const getVerseWords = (book: number, chapter: number, verse: number) =>
        sql<VerseWordSqlRow>`
          SELECT word_text, strongs_numbers
          FROM verse_words
          WHERE book = ${book} AND chapter = ${chapter} AND verse = ${verse}
          ORDER BY word_index
        `.pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              Effect.try({
                try: (): VerseWord => ({
                  text: row.word_text,
                  strongsNumbers:
                    row.strongs_numbers === null ? null : decodeStrongsNumbers(row.strongs_numbers),
                }),
                catch: (cause) =>
                  new BibleDataIntegrityError({
                    cause,
                    location: `verse_words(${book}:${chapter}:${verse}).strongs_numbers`,
                  }),
              }),
            ),
          ),
        );

      const hasStrongsMapping = (book: number, chapter: number, verse: number) =>
        sql<{ readonly count: number }>`
          SELECT COUNT(*) AS count
          FROM verse_words
          WHERE book = ${book} AND chapter = ${chapter} AND verse = ${verse}
        `.pipe(Effect.map((rows) => (rows[0]?.count ?? 0) > 0));

      const getMarginNotes = (book: number, chapter: number, verse: number) =>
        sql<MarginNoteSqlRow>`
          SELECT note_type, phrase, note_text
          FROM margin_notes
          WHERE book = ${book} AND chapter = ${chapter} AND verse = ${verse}
          ORDER BY note_index
        `.pipe(
          Effect.map((rows) =>
            rows.map((row) => ({
              type: marginNoteType(row.note_type),
              phrase: row.phrase,
              text: row.note_text,
            })),
          ),
        );

      return BibleDatabase.of({
        getBooks,
        getBook,
        getChapter,
        getVerse,
        searchVerses,
        getCrossRefs,
        getStrongsEntry,
        searchStrongs,
        getVersesWithStrongs,
        getStrongsCount,
        getVerseWords,
        hasStrongsMapping,
        getMarginNotes,
      });
    }),
  );

  static Test = (
    config: {
      readonly books?: readonly BibleBook[];
      readonly verses?: readonly BibleVerse[];
      readonly crossRefs?: readonly CrossReference[];
      readonly strongsEntries?: readonly StrongsEntry[];
    } = {},
  ): Layer.Layer<BibleDatabase> =>
    Layer.succeed(BibleDatabase, {
      getBooks: () => Effect.succeed(config.books ?? []),
      getBook: (bookNum) =>
        Effect.succeed(Option.fromNullishOr(config.books?.find((book) => book.number === bookNum))),
      getChapter: (book, chapter, versionCode = 'KJV') =>
        Effect.succeed(
          config.verses?.filter(
            (verse) =>
              verse.book === book && verse.chapter === chapter && verse.versionCode === versionCode,
          ) ?? [],
        ),
      getVerse: (book, chapter, verse, versionCode = 'KJV') =>
        Effect.succeed(
          Option.fromNullishOr(
            config.verses?.find(
              (candidate) =>
                candidate.book === book &&
                candidate.chapter === chapter &&
                candidate.verse === verse &&
                candidate.versionCode === versionCode,
            ),
          ),
        ),
      searchVerses: () => Effect.succeed([]),
      getCrossRefs: (book, chapter, verse) =>
        Effect.succeed(
          config.crossRefs?.filter(
            (reference) =>
              reference.book === book && reference.chapter === chapter && reference.verse === verse,
          ) ?? [],
        ),
      getStrongsEntry: (number) =>
        Effect.succeed(
          Option.fromNullishOr(config.strongsEntries?.find((entry) => entry.number === number)),
        ),
      searchStrongs: () => Effect.succeed([]),
      getVersesWithStrongs: () => Effect.succeed([]),
      getStrongsCount: () => Effect.succeed(0),
      getVerseWords: () => Effect.succeed([]),
      hasStrongsMapping: () => Effect.succeed(false),
      getMarginNotes: () => Effect.succeed([]),
    });
}
