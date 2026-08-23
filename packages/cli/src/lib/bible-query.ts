import { Reference, type BibleError, type ParsedBibleQuery, type Verse } from '@bible/core/bible';
import { BibleService } from '@bible/core/bible/service';
import { Effect, Match } from 'effect';

const chapterVerses = (book: number, chapter: number) =>
  Effect.gen(function* () {
    const bible = yield* BibleService;
    return (yield* bible.chapter(Reference.chapter(book, chapter))).verses;
  });

/** Resolve a parsed reference query through the canonical Bible service. */
export function versesForBibleQuery(
  query: ParsedBibleQuery,
): Effect.Effect<readonly Verse[], BibleError, BibleService> {
  return Match.value(query).pipe(
    Match.tagsExhaustive({
      single: (single) =>
        chapterVerses(single.ref.book, single.ref.chapter).pipe(
          Effect.map((verses) =>
            verses.filter((verse) => verse.reference.verse === single.ref.verse),
          ),
        ),
      chapter: (chapter) => chapterVerses(chapter.ref.book, chapter.ref.chapter),
      verseRange: (range) =>
        chapterVerses(range.ref.start.book, range.ref.start.chapter).pipe(
          Effect.map((verses) =>
            verses.filter(
              (verse) =>
                verse.reference.verse >= range.ref.start.verse &&
                verse.reference.verse <= range.ref.end.verse,
            ),
          ),
        ),
      chapterRange: (range) =>
        Effect.forEach(
          Array.from(
            { length: range.end.chapter - range.start.chapter + 1 },
            (_, index) => range.start.chapter + index,
          ),
          (chapter) => chapterVerses(range.start.book, chapter),
        ).pipe(Effect.map((chapters) => chapters.flat())),
      fullBook: (full) =>
        Effect.gen(function* () {
          const bible = yield* BibleService;
          const book = yield* bible.book(full.ref);
          const chapters = yield* Effect.forEach(
            Array.from({ length: book.chapters }, (_, index) => index + 1),
            (chapter) => bible.chapter(Reference.chapter(book.number, chapter)),
          );
          return chapters.flatMap((chapter) => chapter.verses);
        }),
      search: () => Effect.succeed([]),
    }),
  );
}
