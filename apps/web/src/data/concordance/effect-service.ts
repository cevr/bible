import {
  BibleDatabase,
  type BibleDatabaseError,
  type BibleDatabaseService,
} from '@bible/core/bible-db';
import { Context, Effect, Layer, Option, Schema } from 'effect';

import type { MarginNote, StrongsEntry, StrongsVerseHit, VerseWord } from './types';

export class ConcordanceDataError extends Schema.TaggedErrorClass<ConcordanceDataError>()(
  'ConcordanceDataError',
  {
    cause: Schema.Unknown,
    operation: Schema.String,
  },
) {}

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
  ) => Effect.Effect<StrongsVerseHit[], ConcordanceDataError>;
}

const marginNote = (note: {
  readonly index: number;
  readonly type: string;
  readonly phrase: string;
  readonly text: string;
}): MarginNote => ({
  noteIndex: note.index,
  noteType: note.type,
  phrase: note.phrase,
  noteText: note.text,
});

const make = (database: BibleDatabaseService): ConcordanceServiceShape => {
  const mapDataError = <A>(
    operation: string,
    effect: Effect.Effect<A, BibleDatabaseError>,
  ): Effect.Effect<A, ConcordanceDataError> =>
    effect.pipe(Effect.mapError((cause) => new ConcordanceDataError({ cause, operation })));

  return {
    getStrongsEntry: (number) =>
      mapDataError('getStrongsEntry', database.getStrongsEntry(number)).pipe(
        Effect.map(Option.getOrNull),
      ),
    getVerseWords: (book, chapter, verse) =>
      mapDataError('getVerseWords', database.getVerseWords(book, chapter, verse)).pipe(
        Effect.map((words) =>
          words.map((word, wordIndex) => ({
            wordIndex,
            wordText: word.text,
            strongsNumbers: word.strongsNumbers.length === 0 ? null : word.strongsNumbers,
            italic: word.italic,
          })),
        ),
      ),
    getMarginNotes: (book, chapter, verse) =>
      mapDataError('getMarginNotes', database.getMarginNotes(book, chapter, verse)).pipe(
        Effect.map((notes) => notes.map(marginNote)),
      ),
    getChapterMarginNotes: (book, chapter) =>
      mapDataError('getChapterMarginNotes', database.chapterMarginNotes(book, chapter)).pipe(
        Effect.map(
          (notesByVerse) =>
            new Map(
              Array.from(notesByVerse, ([verse, notes]) => [verse, notes.map(marginNote)] as const),
            ),
        ),
      ),
    searchByStrongs: (number) =>
      mapDataError('searchByStrongs', database.getVersesWithStrongs(number)).pipe(
        Effect.map((hits) =>
          hits.map((hit) => ({
            book: hit.book,
            chapter: hit.chapter,
            verse: hit.verse,
            wordText: hit.word,
          })),
        ),
      ),
  };
};

export class ConcordanceService extends Context.Service<
  ConcordanceService,
  ConcordanceServiceShape
>()('@bible/web/concordance/ConcordanceService') {
  static layer = Layer.effect(
    ConcordanceService,
    Effect.gen(function* () {
      return make(yield* BibleDatabase);
    }),
  );
}
