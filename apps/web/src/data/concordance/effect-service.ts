import { Context, Effect, Layer, Option, Schema } from 'effect';

import { DbClientService, type DatabaseQueryError } from '../db-client-service';
import type { ConcordanceResult, MarginNote, StrongsEntry, VerseWord } from './types';

export class ConcordanceDataError extends Schema.TaggedErrorClass<ConcordanceDataError>()(
  'ConcordanceDataError',
  {
    cause: Schema.Unknown,
    operation: Schema.String,
  },
) {}

const StrongsRow = Schema.Struct({
  number: Schema.String,
  language: Schema.String,
  lemma: Schema.String,
  transliteration: Schema.NullOr(Schema.String),
  pronunciation: Schema.NullOr(Schema.String),
  definition: Schema.String,
  kjv_definition: Schema.NullOr(Schema.String),
});

const VerseWordRow = Schema.Struct({
  word_index: Schema.Number,
  word_text: Schema.String,
  strongs_numbers: Schema.NullOr(Schema.String),
});

const MarginNoteRow = Schema.Struct({
  note_index: Schema.Number,
  note_type: Schema.String,
  phrase: Schema.String,
  note_text: Schema.String,
});

const ChapterMarginNoteRow = Schema.Struct({
  verse: Schema.Number,
  note_index: Schema.Number,
  note_type: Schema.String,
  phrase: Schema.String,
  note_text: Schema.String,
});

const ConcordanceRow = Schema.Struct({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  word_text: Schema.NullOr(Schema.String),
});

const decodeStrongsNumbers = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(Schema.String)),
);

interface ConcordanceServiceShape {
  readonly getStrongsEntry: (
    number: string,
  ) => Effect.Effect<StrongsEntry | null, ConcordanceDataError>;
  readonly getVerseWords: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<VerseWord[], ConcordanceDataError>;
  readonly getMarginNotes: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<MarginNote[], ConcordanceDataError>;
  readonly getChapterMarginNotes: (
    book: number,
    chapter: number,
  ) => Effect.Effect<Map<number, MarginNote[]>, ConcordanceDataError>;
  readonly searchByStrongs: (
    number: string,
  ) => Effect.Effect<ConcordanceResult[], ConcordanceDataError>;
}

export class ConcordanceService extends Context.Service<
  ConcordanceService,
  ConcordanceServiceShape
>()('@bible/web/concordance/ConcordanceService') {
  static layer = Layer.effect(
    ConcordanceService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const getStrongsEntry = Effect.fn('ConcordanceService.getStrongsEntry')(function* (
        number: string,
      ) {
        const [row] = yield* db.query(
          StrongsRow,
          'bible',
          'SELECT number, language, lemma, transliteration, pronunciation, definition, kjv_definition FROM strongs WHERE number = ?',
          [number],
        );
        if (!row) return null;
        return {
          number: row.number,
          language: row.language as 'hebrew' | 'greek',
          lemma: row.lemma,
          transliteration: row.transliteration,
          pronunciation: row.pronunciation,
          definition: row.definition,
          kjvDefinition: row.kjv_definition,
        } satisfies StrongsEntry;
      });

      const getVerseWords = Effect.fn('ConcordanceService.getVerseWords')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        const rows = yield* db.query(
          VerseWordRow,
          'bible',
          'SELECT word_index, word_text, strongs_numbers FROM verse_words WHERE book = ? AND chapter = ? AND verse = ? ORDER BY word_index',
          [book, chapter, verse],
        );
        return rows.map(
          (row): VerseWord => ({
            wordIndex: row.word_index,
            wordText: row.word_text,
            strongsNumbers: row.strongs_numbers
              ? Option.getOrNull(decodeStrongsNumbers(row.strongs_numbers))
              : null,
          }),
        );
      });

      const getMarginNotes = Effect.fn('ConcordanceService.getMarginNotes')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        const rows = yield* db.query(
          MarginNoteRow,
          'bible',
          'SELECT note_index, note_type, phrase, note_text FROM margin_notes WHERE book = ? AND chapter = ? AND verse = ? ORDER BY note_index',
          [book, chapter, verse],
        );
        return rows.map(
          (row): MarginNote => ({
            noteIndex: row.note_index,
            noteType: row.note_type,
            phrase: row.phrase,
            noteText: row.note_text,
          }),
        );
      });

      const getChapterMarginNotes = Effect.fn('ConcordanceService.getChapterMarginNotes')(
        function* (book: number, chapter: number) {
          const rows = yield* db.query(
            ChapterMarginNoteRow,
            'bible',
            'SELECT verse, note_index, note_type, phrase, note_text FROM margin_notes WHERE book = ? AND chapter = ? ORDER BY verse, note_index',
            [book, chapter],
          );
          const notesByVerse = new Map<number, MarginNote[]>();
          for (const row of rows) {
            const notes = notesByVerse.get(row.verse) ?? [];
            notes.push({
              noteIndex: row.note_index,
              noteType: row.note_type,
              phrase: row.phrase,
              noteText: row.note_text,
            });
            notesByVerse.set(row.verse, notes);
          }
          return notesByVerse;
        },
      );

      const searchByStrongs = Effect.fn('ConcordanceService.searchByStrongs')(function* (
        number: string,
      ) {
        const rows = yield* db.query(
          ConcordanceRow,
          'bible',
          'SELECT book, chapter, verse, word_text FROM strongs_verses WHERE strongs_number = ? ORDER BY book, chapter, verse',
          [number],
        );
        return rows.map(
          (row): ConcordanceResult => ({
            book: row.book,
            chapter: row.chapter,
            verse: row.verse,
            wordText: row.word_text,
          }),
        );
      });

      const mapDataError = <A>(operation: string, effect: Effect.Effect<A, DatabaseQueryError>) =>
        effect.pipe(Effect.mapError((cause) => new ConcordanceDataError({ cause, operation })));

      return ConcordanceService.of({
        getStrongsEntry: (number) => mapDataError('getStrongsEntry', getStrongsEntry(number)),
        getVerseWords: (book, chapter, verse) =>
          mapDataError('getVerseWords', getVerseWords(book, chapter, verse)),
        getMarginNotes: (book, chapter, verse) =>
          mapDataError('getMarginNotes', getMarginNotes(book, chapter, verse)),
        getChapterMarginNotes: (book, chapter) =>
          mapDataError('getChapterMarginNotes', getChapterMarginNotes(book, chapter)),
        searchByStrongs: (number) => mapDataError('searchByStrongs', searchByStrongs(number)),
      });
    }),
  );
}
