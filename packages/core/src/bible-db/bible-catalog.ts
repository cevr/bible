/** Administrative import capability for the canonical unified Bible schema. */

import { Context, Effect, Layer } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';

import { BIBLE_BOOKS } from '../bible/canon.js';
import { initializeBibleSchema } from './schema.js';

export interface KjvAssetFile {
  readonly metadata?: {
    readonly name?: string;
    readonly shortname?: string;
    readonly year?: string;
    readonly copyright_statement?: string;
  };
  readonly verses: readonly {
    readonly book_name: string;
    readonly book: number;
    readonly chapter: number;
    readonly verse: number;
    readonly text: string;
  }[];
}

export interface StrongsWordAsset {
  readonly text: string;
  readonly strongs?: readonly string[];
  readonly italic?: boolean;
}

export interface StrongsVerseAsset {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly words: readonly StrongsWordAsset[];
}

export interface StrongsLexiconAsset {
  readonly lemma: string;
  readonly xlit?: string;
  readonly def: string;
}

export interface CrossReferenceCatalog {
  readonly [key: string]: {
    readonly refs: readonly {
      readonly book: number;
      readonly chapter: number;
      readonly verse?: number;
      readonly verseEnd?: number;
    }[];
  };
}

export type CrossReferenceSource = 'openbible' | 'tske';

export interface MarginNotesCatalog {
  readonly [key: string]: readonly {
    readonly type: 'hebrew' | 'greek' | 'alternate' | 'name' | 'other';
    readonly phrase: string;
    readonly text: string;
  }[];
}

export interface BibleCatalogStatus {
  readonly kjv: boolean;
  readonly crossReferences: boolean;
  readonly marginNotes: boolean;
}

export interface BibleCatalogService {
  readonly status: () => Effect.Effect<BibleCatalogStatus, SqlError>;
  readonly importKjv: (
    kjv: KjvAssetFile,
    strongsVerses: readonly StrongsVerseAsset[],
  ) => Effect.Effect<{ readonly verses: number; readonly withStrongs: number }, SqlError>;
  readonly importStrongsLexicon: (
    lexicon: Readonly<Record<string, StrongsLexiconAsset>>,
  ) => Effect.Effect<{ readonly imported: number; readonly skipped: number }, SqlError>;
  readonly importCrossReferences: (
    source: CrossReferenceSource,
    catalog: CrossReferenceCatalog,
  ) => Effect.Effect<{ readonly imported: number; readonly skipped: number }, SqlError>;
  readonly importMarginNotes: (
    catalog: MarginNotesCatalog,
  ) => Effect.Effect<{ readonly imported: number; readonly skipped: number }, SqlError>;
  readonly finalizeImport: (createdAt: string) => Effect.Effect<void, SqlError>;
  readonly resetKjv: () => Effect.Effect<void, SqlError>;
}

const parseVerseKey = (
  key: string,
): { readonly book: number; readonly chapter: number; readonly verse: number } | null => {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  const book = Number(parts[0]);
  const chapter = Number(parts[1]);
  const verse = Number(parts[2]);
  return Number.isInteger(book) && Number.isInteger(chapter) && Number.isInteger(verse)
    ? { book, chapter, verse }
    : null;
};

export class BibleCatalog extends Context.Service<BibleCatalog, BibleCatalogService>()(
  '@bible/core/bible-db/BibleCatalog',
) {
  static layerCore: Layer.Layer<BibleCatalog, SqlError, SqlClient.SqlClient> = Layer.effect(
    BibleCatalog,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* initializeBibleSchema(sql);

      const status = () =>
        Effect.all({
          verses: sql<{ readonly count: number }>`SELECT COUNT(*) AS count FROM verses`,
          lexicon: sql<{ readonly count: number }>`SELECT COUNT(*) AS count FROM strongs`,
          openbible: sql<{ readonly count: number }>`
            SELECT COUNT(*) AS count FROM cross_refs WHERE source = 'openbible'
          `,
          tske: sql<{ readonly count: number }>`
            SELECT COUNT(*) AS count FROM cross_refs WHERE source = 'tske'
          `,
          notes: sql<{ readonly count: number }>`SELECT COUNT(*) AS count FROM margin_notes`,
        }).pipe(
          Effect.map(({ verses, lexicon, openbible, tske, notes }) => ({
            kjv: (verses[0]?.count ?? 0) >= 31_102 && (lexicon[0]?.count ?? 0) > 0,
            crossReferences: (openbible[0]?.count ?? 0) > 0 && (tske[0]?.count ?? 0) > 0,
            marginNotes: (notes[0]?.count ?? 0) > 0,
          })),
        );

      const importKjv = (kjv: KjvAssetFile, strongsVerses: readonly StrongsVerseAsset[]) =>
        sql.withTransaction(
          Effect.gen(function* () {
            for (const book of BIBLE_BOOKS) {
              yield* sql`
                INSERT INTO books (number, name, abbreviation, testament, chapters)
                VALUES (${book.number}, ${book.name}, ${book.abbreviation}, ${book.testament}, ${book.chapters})
                ON CONFLICT(number) DO UPDATE SET
                  name = excluded.name,
                  abbreviation = excluded.abbreviation,
                  testament = excluded.testament,
                  chapters = excluded.chapters
              `;
            }
            const metadata = kjv.metadata;
            yield* sql`
              INSERT INTO versions (code, name, language, year, copyright, is_default)
              VALUES (
                'KJV',
                ${metadata?.name ?? 'King James Version'},
                'en',
                ${metadata?.year ?? null},
                ${metadata?.copyright_statement ?? 'Public Domain'},
                1
              )
              ON CONFLICT(code) DO UPDATE SET
                name = excluded.name,
                year = excluded.year,
                copyright = excluded.copyright,
                is_default = 1
            `;
            for (const verse of kjv.verses) {
              yield* sql`
                INSERT INTO verses (book, chapter, verse, version_code, text)
                VALUES (${verse.book}, ${verse.chapter}, ${verse.verse}, 'KJV', ${verse.text})
                ON CONFLICT(version_code, book, chapter, verse)
                DO UPDATE SET text = excluded.text
              `;
            }
            yield* sql`DELETE FROM strongs_verses`;
            yield* sql`DELETE FROM verse_words`;
            for (const verse of strongsVerses) {
              let wordIndex = 0;
              for (const word of verse.words) {
                const encoded = word.strongs === undefined ? null : JSON.stringify(word.strongs);
                yield* sql`
                  INSERT INTO verse_words (
                    book, chapter, verse, word_index, word_text, strongs_numbers
                  ) VALUES (
                    ${verse.book}, ${verse.chapter}, ${verse.verse}, ${wordIndex},
                    ${word.text}, ${encoded}
                  )
                `;
                for (const number of word.strongs ?? []) {
                  yield* sql`
                    INSERT OR IGNORE INTO strongs_verses (
                      strongs_number, book, chapter, verse, word_text, word_index
                    ) VALUES (
                      ${number.toUpperCase()}, ${verse.book}, ${verse.chapter}, ${verse.verse},
                      ${word.text}, ${wordIndex}
                    )
                  `;
                }
                wordIndex += 1;
              }
            }
            return { verses: kjv.verses.length, withStrongs: strongsVerses.length };
          }),
        );

      const importStrongsLexicon = (lexicon: Readonly<Record<string, StrongsLexiconAsset>>) =>
        sql.withTransaction(
          Effect.gen(function* () {
            let imported = 0;
            let skipped = 0;
            for (const [rawNumber, entry] of Object.entries(lexicon)) {
              const number = rawNumber.toUpperCase();
              const language = number.startsWith('H')
                ? 'hebrew'
                : number.startsWith('G')
                  ? 'greek'
                  : null;
              if (language === null) {
                skipped += 1;
                continue;
              }
              yield* sql`
                INSERT INTO strongs (
                  number, language, lemma, transliteration, pronunciation, definition, kjv_definition
                ) VALUES (
                  ${number}, ${language}, ${entry.lemma}, ${entry.xlit ?? null},
                  NULL, ${entry.def}, NULL
                )
                ON CONFLICT(number) DO UPDATE SET
                  language = excluded.language,
                  lemma = excluded.lemma,
                  transliteration = excluded.transliteration,
                  definition = excluded.definition
              `;
              imported += 1;
            }
            return { imported, skipped };
          }),
        );

      const importCrossReferences = (
        source: CrossReferenceSource,
        catalog: CrossReferenceCatalog,
      ) =>
        sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM cross_refs WHERE source = ${source}`;
            let imported = 0;
            let skipped = 0;
            for (const [key, entry] of Object.entries(catalog)) {
              const from = parseVerseKey(key);
              if (from === null) {
                skipped += 1;
                continue;
              }
              for (const reference of entry.refs) {
                yield* sql`
                  INSERT INTO cross_refs (
                    book, chapter, verse, ref_book, ref_chapter, ref_verse,
                    ref_verse_end, source, preview_text
                  ) VALUES (
                    ${from.book}, ${from.chapter}, ${from.verse}, ${reference.book},
                    ${reference.chapter}, ${reference.verse ?? null},
                    ${reference.verseEnd ?? null}, ${source}, NULL
                  )
                `;
                imported += 1;
              }
            }
            return { imported, skipped };
          }),
        );

      const importMarginNotes = (catalog: MarginNotesCatalog) =>
        sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM margin_notes`;
            let imported = 0;
            let skipped = 0;
            for (const [key, notes] of Object.entries(catalog)) {
              const reference = parseVerseKey(key);
              if (reference === null) {
                skipped += 1;
                continue;
              }
              let noteIndex = 0;
              for (const note of notes) {
                yield* sql`
                  INSERT INTO margin_notes (
                    book, chapter, verse, note_index, note_type, phrase, note_text
                  ) VALUES (
                    ${reference.book}, ${reference.chapter}, ${reference.verse}, ${noteIndex},
                    ${note.type}, ${note.phrase}, ${note.text}
                  )
                `;
                noteIndex += 1;
                imported += 1;
              }
            }
            return { imported, skipped };
          }),
        );

      const finalizeImport = (createdAt: string) =>
        Effect.gen(function* () {
          yield* sql`
            INSERT INTO meta (key, value) VALUES ('schema_version', '1')
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `;
          yield* sql`
            INSERT INTO meta (key, value) VALUES ('created_at', ${createdAt})
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `;
          yield* sql.unsafe(`INSERT INTO verses_fts(verses_fts) VALUES('optimize')`);
          yield* sql.unsafe(`INSERT INTO strongs_fts(strongs_fts) VALUES('optimize')`);
          yield* sql.unsafe(`INSERT INTO margin_notes_fts(margin_notes_fts) VALUES('optimize')`);
          yield* sql.unsafe('ANALYZE');
          yield* sql.unsafe('VACUUM');
        });

      const resetKjv = () =>
        sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM strongs_verses`;
            yield* sql`DELETE FROM verse_words`;
            yield* sql`DELETE FROM strongs`;
            yield* sql`DELETE FROM verses WHERE version_code = 'KJV'`;
            yield* sql`DELETE FROM versions WHERE code = 'KJV'`;
          }),
        );

      return BibleCatalog.of({
        status,
        importKjv,
        importStrongsLexicon,
        importCrossReferences,
        importMarginNotes,
        finalizeImport,
        resetKjv,
      });
    }),
  );
}
