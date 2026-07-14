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
  readonly strongsNumbers: readonly string[];
  readonly italic: boolean;
}

export interface MarginNote {
  readonly index: number;
  readonly type: 'hebrew' | 'greek' | 'alternate' | 'name' | 'other';
  readonly phrase: string;
  readonly text: string;
}

export interface ConcordanceHit {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
  readonly word: string;
}

export interface VerseSearchResult extends BibleVerse {}

export interface VerseSearchOptions {
  readonly books?: readonly number[];
  readonly offset?: number;
  readonly limit?: number;
  readonly versionCode?: string;
}

export interface VerseSearchWindow {
  readonly results: readonly VerseSearchResult[];
  readonly total: number;
}

export interface StrongsVerse {
  readonly verse: number;
  readonly words: readonly VerseWord[];
}

export interface StrongsChapter {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verses: readonly StrongsVerse[];
}

export interface BibleDatabaseService {
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
  readonly searchVerseWindow: (
    query: string,
    options?: VerseSearchOptions,
  ) => Effect.Effect<VerseSearchWindow, BibleDatabaseError>;
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
    limit?: number,
  ) => Effect.Effect<readonly ConcordanceHit[], BibleDatabaseError>;
  readonly getStrongsCount: (strongsNumber: string) => Effect.Effect<number, BibleDatabaseError>;
  readonly getVerseWords: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly VerseWord[], BibleDatabaseError>;
  readonly getMarginNotes: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly MarginNote[], BibleDatabaseError>;
  readonly getChapterStrongs: (
    book: number,
    chapter: number,
  ) => Effect.Effect<Option.Option<StrongsChapter>, BibleDatabaseError>;
  readonly versesWithCrossRefs: (
    book: number,
    chapter: number,
  ) => Effect.Effect<ReadonlySet<number>, BibleDatabaseError>;
  readonly versesWithNotes: (
    book: number,
    chapter: number,
  ) => Effect.Effect<ReadonlySet<number>, BibleDatabaseError>;
  readonly chapterMarginNotes: (
    book: number,
    chapter: number,
  ) => Effect.Effect<ReadonlyMap<number, readonly MarginNote[]>, BibleDatabaseError>;
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
  readonly italic: number;
}

interface MarginNoteSqlRow {
  readonly note_index?: number;
  readonly verse?: number;
  readonly note_type: string;
  readonly phrase: string;
  readonly note_text: string;
}

interface StrongsChapterSqlRow {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly book_name: string;
  readonly word_index: number;
  readonly word_text: string;
  readonly strongs_numbers: string | null;
  readonly italic: number;
}

interface StrongsHitSqlRow {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly book_name: string;
  readonly text: string;
  readonly word_text: string | null;
}

const StrongsNumbersJson = Schema.fromJsonString(Schema.Array(Schema.String));
const decodeStrongsNumbers = Schema.decodeUnknownSync(StrongsNumbersJson);

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
  static layer: Layer.Layer<BibleDatabase, never, SqlClient.SqlClient> = Layer.effect(
    BibleDatabase,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const getChapter = Effect.fn('BibleDatabase.getChapter')(
        (book: number, chapter: number, versionCode = 'KJV') =>
          sql<VerseSqlRow>`
          SELECT book, chapter, verse, version_code, text
          FROM verses
          WHERE version_code = ${versionCode} AND book = ${book} AND chapter = ${chapter}
          ORDER BY verse
          `.pipe(Effect.map((rows) => rows.map(bibleVerse))),
      );

      const getVerse = Effect.fn('BibleDatabase.getVerse')(
        (book: number, chapter: number, verse: number, versionCode = 'KJV') =>
          sql<VerseSqlRow>`
          SELECT book, chapter, verse, version_code, text
          FROM verses
          WHERE version_code = ${versionCode}
            AND book = ${book}
            AND chapter = ${chapter}
            AND verse = ${verse}
          `.pipe(Effect.map((rows) => Option.fromNullishOr(rows[0]).pipe(Option.map(bibleVerse)))),
      );

      const searchVerseWindow = Effect.fn('BibleDatabase.searchVerseWindow')((
        query: string,
        options: VerseSearchOptions = {},
      ): Effect.Effect<VerseSearchWindow, SqlError> => {
        const escaped = query.replace(/['"*]/g, '').trim();
        if (escaped.length === 0) {
          return Effect.succeed<VerseSearchWindow>({ results: [], total: 0 });
        }

        const versionCode = options.versionCode ?? 'KJV';
        const offset = Math.max(0, Math.trunc(options.offset ?? 0));
        const limit = Math.max(1, Math.trunc(options.limit ?? 50));
        const books = options.books?.filter((book) => Number.isInteger(book)) ?? [];
        const match = `"${escaped}"`;

        const count =
          books.length === 0
            ? sql<{ readonly total: number }>`
                SELECT COUNT(*) AS total
                FROM verses AS v
                JOIN verses_fts AS fts ON v.rowid = fts.rowid
                WHERE verses_fts MATCH ${match} AND v.version_code = ${versionCode}
              `
            : sql<{ readonly total: number }>`
                SELECT COUNT(*) AS total
                FROM verses AS v
                JOIN verses_fts AS fts ON v.rowid = fts.rowid
                WHERE verses_fts MATCH ${match}
                  AND v.version_code = ${versionCode}
                  AND ${sql.in('v.book', books)}
              `;

        const results =
          books.length === 0
            ? sql<VerseSqlRow>`
                SELECT v.book, v.chapter, v.verse, v.version_code, v.text
                FROM verses AS v
                JOIN verses_fts AS fts ON v.rowid = fts.rowid
                WHERE verses_fts MATCH ${match} AND v.version_code = ${versionCode}
                ORDER BY rank
                LIMIT ${limit} OFFSET ${offset}
              `
            : sql<VerseSqlRow>`
                SELECT v.book, v.chapter, v.verse, v.version_code, v.text
                FROM verses AS v
                JOIN verses_fts AS fts ON v.rowid = fts.rowid
                WHERE verses_fts MATCH ${match}
                  AND v.version_code = ${versionCode}
                  AND ${sql.in('v.book', books)}
                ORDER BY rank
                LIMIT ${limit} OFFSET ${offset}
              `;

        return Effect.all({ count, results }).pipe(
          Effect.map(({ count, results }) => ({
            results: results.map(bibleVerse),
            total: count[0]?.total ?? 0,
          })),
        );
      });

      const getCrossRefs = Effect.fn('BibleDatabase.getCrossRefs')(
        (book: number, chapter: number, verse: number) =>
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
          ),
      );

      const getStrongsEntry = Effect.fn('BibleDatabase.getStrongsEntry')((number: string) =>
        sql<StrongsSqlRow>`
          SELECT number, language, lemma, transliteration, pronunciation, definition, kjv_definition
          FROM strongs
          WHERE number = ${number.toUpperCase()}
          `.pipe(
          Effect.map((rows) => Option.fromNullishOr(rows[0]).pipe(Option.map(strongsEntry))),
        ),
      );

      const searchStrongs = Effect.fn('BibleDatabase.searchStrongs')((
        query: string,
        limit = 50,
      ) => {
        const normalized = query.trim();
        if (normalized.length === 0) return Effect.succeed<StrongsEntry[]>([]);
        const like = `%${normalized}%`;
        return sql<StrongsSqlRow>`
          SELECT number, language, lemma, transliteration, pronunciation, definition, kjv_definition
          FROM strongs
          WHERE lemma LIKE ${like} COLLATE NOCASE
             OR transliteration LIKE ${like} COLLATE NOCASE
             OR definition LIKE ${like} COLLATE NOCASE
          ORDER BY number
          LIMIT ${limit}
        `.pipe(Effect.map((rows) => rows.map(strongsEntry)));
      });

      const getVersesWithStrongs = Effect.fn('BibleDatabase.getVersesWithStrongs')(
        (strongsNumber: string, limit?: number) =>
          sql<StrongsHitSqlRow>`
          SELECT sv.book, sv.chapter, sv.verse, b.name AS book_name,
                 v.text, MIN(sv.word_text) AS word_text
          FROM strongs_verses AS sv
          JOIN verses AS v
            ON v.book = sv.book AND v.chapter = sv.chapter AND v.verse = sv.verse
           AND v.version_code = 'KJV'
          JOIN books AS b ON b.number = sv.book
          WHERE sv.strongs_number = ${strongsNumber.toUpperCase()}
          GROUP BY sv.book, sv.chapter, sv.verse, b.name, v.text
          ORDER BY sv.book, sv.chapter, sv.verse
        `.pipe(
            Effect.map((rows) =>
              rows.slice(0, limit ?? rows.length).map((row) => ({
                book: row.book,
                bookName: row.book_name,
                chapter: row.chapter,
                verse: row.verse,
                text: row.text,
                word: row.word_text ?? '',
              })),
            ),
          ),
      );

      const getStrongsCount = Effect.fn('BibleDatabase.getStrongsCount')((strongsNumber: string) =>
        sql<{ readonly count: number }>`
          SELECT COUNT(DISTINCT book || '.' || chapter || '.' || verse) AS count
          FROM strongs_verses
          WHERE strongs_number = ${strongsNumber.toUpperCase()}
          `.pipe(Effect.map((rows) => rows[0]?.count ?? 0)),
      );

      // Published Bible databases predate the italic column. Detect it lazily
      // at the first word query so readonly clients remain compatible with an
      // older snapshot while newly imported databases preserve the richer
      // corpus shape immediately.
      let hasItalicColumn: boolean | undefined;
      const supportsWordItalics = Effect.fn('BibleDatabase.supportsWordItalics')(() => {
        if (hasItalicColumn !== undefined) return Effect.succeed(hasItalicColumn);
        return sql<{ readonly name: string }>`PRAGMA table_info(verse_words)`.pipe(
          Effect.map((columns) => {
            hasItalicColumn = columns.some((column) => column.name === 'italic');
            return hasItalicColumn;
          }),
        );
      });

      const getVerseWords = Effect.fn('BibleDatabase.getVerseWords')(
        (book: number, chapter: number, verse: number) =>
          supportsWordItalics().pipe(
            Effect.flatMap((supportsItalics) =>
              supportsItalics
                ? sql<VerseWordSqlRow>`
                    SELECT word_text, strongs_numbers, italic
                    FROM verse_words
                    WHERE book = ${book} AND chapter = ${chapter} AND verse = ${verse}
                    ORDER BY word_index
                  `
                : sql<VerseWordSqlRow>`
                    SELECT word_text, strongs_numbers, 0 AS italic
                    FROM verse_words
                    WHERE book = ${book} AND chapter = ${chapter} AND verse = ${verse}
                    ORDER BY word_index
                  `,
            ),
            Effect.flatMap((rows) =>
              Effect.forEach(rows, (row) =>
                Effect.try({
                  try: (): VerseWord => ({
                    text: row.word_text,
                    strongsNumbers:
                      row.strongs_numbers === null ? [] : decodeStrongsNumbers(row.strongs_numbers),
                    italic: row.italic === 1,
                  }),
                  catch: (cause) =>
                    new BibleDataIntegrityError({
                      cause,
                      location: `verse_words(${book}:${chapter}:${verse}).strongs_numbers`,
                    }),
                }),
              ),
            ),
          ),
      );

      const getMarginNotes = Effect.fn('BibleDatabase.getMarginNotes')(
        (book: number, chapter: number, verse: number) =>
          sql<MarginNoteSqlRow>`
          SELECT note_index, note_type, phrase, note_text
          FROM margin_notes
          WHERE book = ${book} AND chapter = ${chapter} AND verse = ${verse}
          ORDER BY note_index
        `.pipe(
            Effect.map((rows) =>
              rows.map((row) => ({
                index: row.note_index ?? 0,
                type: marginNoteType(row.note_type),
                phrase: row.phrase,
                text: row.note_text,
              })),
            ),
          ),
      );

      const decodeWord = (
        row: Pick<StrongsChapterSqlRow, 'word_text' | 'strongs_numbers' | 'italic'>,
        location: string,
      ) =>
        Effect.try({
          try: (): VerseWord => ({
            text: row.word_text,
            strongsNumbers:
              row.strongs_numbers === null ? [] : decodeStrongsNumbers(row.strongs_numbers),
            italic: row.italic === 1,
          }),
          catch: (cause) => new BibleDataIntegrityError({ cause, location }),
        });

      const getChapterStrongs = Effect.fn('BibleDatabase.getChapterStrongs')(
        (book: number, chapter: number) =>
          supportsWordItalics().pipe(
            Effect.flatMap((supportsItalics) =>
              supportsItalics
                ? sql<StrongsChapterSqlRow>`
                    SELECT v.book, v.chapter, v.verse, b.name AS book_name,
                           w.word_index, w.word_text, w.strongs_numbers, w.italic
                    FROM verse_words AS w
                    JOIN verses AS v
                      ON v.book = w.book AND v.chapter = w.chapter AND v.verse = w.verse
                     AND v.version_code = 'KJV'
                    JOIN books AS b ON b.number = v.book
                    WHERE w.book = ${book} AND w.chapter = ${chapter}
                    ORDER BY v.verse, w.word_index
                  `
                : sql<StrongsChapterSqlRow>`
                    SELECT v.book, v.chapter, v.verse, b.name AS book_name,
                           w.word_index, w.word_text, w.strongs_numbers, 0 AS italic
                    FROM verse_words AS w
                    JOIN verses AS v
                      ON v.book = w.book AND v.chapter = w.chapter AND v.verse = w.verse
                     AND v.version_code = 'KJV'
                    JOIN books AS b ON b.number = v.book
                    WHERE w.book = ${book} AND w.chapter = ${chapter}
                    ORDER BY v.verse, w.word_index
                  `,
            ),
            Effect.flatMap((rows) =>
              Effect.gen(function* () {
                const byVerse = new Map<number, VerseWord[]>();
                for (const row of rows) {
                  const word = yield* decodeWord(
                    row,
                    `verse_words(${row.book}:${row.chapter}:${row.verse}:${row.word_index})`,
                  );
                  const words = byVerse.get(row.verse);
                  if (words === undefined) byVerse.set(row.verse, [word]);
                  else words.push(word);
                }
                const first = rows[0];
                if (first === undefined) return Option.none<StrongsChapter>();
                return Option.some<StrongsChapter>({
                  book,
                  bookName: first.book_name,
                  chapter,
                  verses: Array.from(byVerse, ([verse, words]) => ({
                    verse,
                    words,
                  })),
                });
              }),
            ),
          ),
      );

      const versesWithCrossRefs = Effect.fn('BibleDatabase.versesWithCrossRefs')(
        (book: number, chapter: number) =>
          sql<{ readonly verse: number }>`
          SELECT DISTINCT verse
          FROM cross_refs
          WHERE book = ${book} AND chapter = ${chapter}
          ORDER BY verse
          `.pipe(
            Effect.map((rows) => new Set(rows.map((row) => row.verse)) as ReadonlySet<number>),
          ),
      );

      const versesWithNotes = Effect.fn('BibleDatabase.versesWithNotes')(
        (book: number, chapter: number) =>
          sql<{ readonly verse: number }>`
          SELECT DISTINCT verse
          FROM margin_notes
          WHERE book = ${book} AND chapter = ${chapter}
          ORDER BY verse
          `.pipe(
            Effect.map((rows) => new Set(rows.map((row) => row.verse)) as ReadonlySet<number>),
          ),
      );

      const chapterMarginNotes = Effect.fn('BibleDatabase.chapterMarginNotes')(
        (book: number, chapter: number) =>
          sql<MarginNoteSqlRow>`
          SELECT verse, note_index, note_type, phrase, note_text
          FROM margin_notes
          WHERE book = ${book} AND chapter = ${chapter}
          ORDER BY verse, note_index
        `.pipe(
            Effect.map((rows) => {
              const byVerse = new Map<number, MarginNote[]>();
              for (const row of rows) {
                if (row.verse === undefined) continue;
                const note: MarginNote = {
                  index: row.note_index ?? 0,
                  type: marginNoteType(row.note_type),
                  phrase: row.phrase,
                  text: row.note_text,
                };
                const notes = byVerse.get(row.verse);
                if (notes === undefined) byVerse.set(row.verse, [note]);
                else notes.push(note);
              }
              return byVerse;
            }),
          ),
      );

      return BibleDatabase.of({
        getChapter,
        getVerse,
        searchVerseWindow,
        getCrossRefs,
        getStrongsEntry,
        searchStrongs,
        getVersesWithStrongs,
        getStrongsCount,
        getVerseWords,
        getMarginNotes,
        getChapterStrongs,
        versesWithCrossRefs,
        versesWithNotes,
        chapterMarginNotes,
      });
    }),
  );

  static layerTest = (
    config: {
      readonly verses?: readonly BibleVerse[];
      readonly crossRefs?: readonly {
        readonly book: number;
        readonly chapter: number;
        readonly verse: number;
        readonly references: readonly CrossReference[];
      }[];
      readonly strongsEntries?: readonly StrongsEntry[];
      readonly verseWords?: readonly {
        readonly book: number;
        readonly chapter: number;
        readonly verse: number;
        readonly words: readonly VerseWord[];
      }[];
      readonly marginNotes?: readonly {
        readonly book: number;
        readonly chapter: number;
        readonly verse: number;
        readonly notes: readonly MarginNote[];
      }[];
      readonly concordanceHits?: Readonly<Record<string, readonly ConcordanceHit[]>>;
    } = {},
  ): Layer.Layer<BibleDatabase> =>
    Layer.succeed(BibleDatabase, {
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
      searchVerseWindow: (query, options = {}) => {
        const normalized = query.replace(/['"*]/g, '').trim().toLocaleLowerCase();
        if (normalized.length === 0) {
          return Effect.succeed<VerseSearchWindow>({ results: [], total: 0 });
        }
        const versionCode = options.versionCode ?? 'KJV';
        const books = new Set(options.books ?? []);
        const matches =
          config.verses?.filter(
            (verse) =>
              verse.versionCode === versionCode &&
              (books.size === 0 || books.has(verse.book)) &&
              verse.text.toLocaleLowerCase().includes(normalized),
          ) ?? [];
        const offset = Math.max(0, Math.trunc(options.offset ?? 0));
        const limit = Math.max(1, Math.trunc(options.limit ?? 50));
        return Effect.succeed({
          results: matches.slice(offset, offset + limit),
          total: matches.length,
        });
      },
      getCrossRefs: (book, chapter, verse) =>
        Effect.succeed(
          config.crossRefs?.find(
            (fixture) =>
              fixture.book === book && fixture.chapter === chapter && fixture.verse === verse,
          )?.references ?? [],
        ),
      getStrongsEntry: (number) =>
        Effect.succeed(
          Option.fromNullishOr(config.strongsEntries?.find((entry) => entry.number === number)),
        ),
      searchStrongs: () => Effect.succeed([]),
      getVersesWithStrongs: (number) => Effect.succeed(config.concordanceHits?.[number] ?? []),
      getStrongsCount: () => Effect.succeed(0),
      getVerseWords: (book, chapter, verse) =>
        Effect.succeed(
          config.verseWords?.find(
            (fixture) =>
              fixture.book === book && fixture.chapter === chapter && fixture.verse === verse,
          )?.words ?? [],
        ),
      getMarginNotes: (book, chapter, verse) =>
        Effect.succeed(
          config.marginNotes?.find(
            (fixture) =>
              fixture.book === book && fixture.chapter === chapter && fixture.verse === verse,
          )?.notes ?? [],
        ),
      getChapterStrongs: () => Effect.succeed(Option.none()),
      versesWithCrossRefs: () => Effect.succeed(new Set()),
      versesWithNotes: () => Effect.succeed(new Set()),
      chapterMarginNotes: (book, chapter) =>
        Effect.succeed(
          new Map(
            config.marginNotes
              ?.filter((fixture) => fixture.book === book && fixture.chapter === chapter)
              .map((fixture) => [fixture.verse, fixture.notes] as const) ?? [],
          ),
        ),
    });
}
