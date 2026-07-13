import { Reference, type BibleError, type ParsedBibleQuery, type Verse } from '@bible/core/bible';
import { BibleService } from '@bible/core/bible/service';
import { Effect } from 'effect';

const chapterVerses = (book: number, chapter: number) =>
  Effect.gen(function* () {
    const bible = yield* BibleService;
    return (yield* bible.chapter(Reference.chapter(book, chapter))).verses;
  });

/** Resolve a parsed reference query through the canonical Bible service. */
export function versesForBibleQuery(
  query: ParsedBibleQuery,
): Effect.Effect<readonly Verse[], BibleError, BibleService> {
  switch (query._tag) {
    case 'single':
      return chapterVerses(query.ref.book, query.ref.chapter).pipe(
        Effect.map((verses) => verses.filter((verse) => verse.reference.verse === query.ref.verse)),
      );
    case 'chapter':
      return chapterVerses(query.ref.book, query.ref.chapter);
    case 'verseRange':
      return chapterVerses(query.ref.start.book, query.ref.start.chapter).pipe(
        Effect.map((verses) =>
          verses.filter(
            (verse) =>
              verse.reference.verse >= query.ref.start.verse &&
              verse.reference.verse <= query.ref.end.verse,
          ),
        ),
      );
    case 'chapterRange':
      return Effect.forEach(
        Array.from(
          { length: query.end.chapter - query.start.chapter + 1 },
          (_, index) => query.start.chapter + index,
        ),
        (chapter) => chapterVerses(query.start.book, chapter),
      ).pipe(Effect.map((chapters) => chapters.flat()));
    case 'fullBook':
      return Effect.gen(function* () {
        const bible = yield* BibleService;
        const book = yield* bible.book(query.ref);
        const chapters = yield* Effect.forEach(
          Array.from({ length: book.chapters }, (_, index) => index + 1),
          (chapter) => bible.chapter(Reference.chapter(book.number, chapter)),
        );
        return chapters.flatMap((chapter) => chapter.verses);
      });
    case 'search':
      return Effect.succeed([]);
  }
}
