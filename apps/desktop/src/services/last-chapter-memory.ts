import { Context, Effect, Layer, Option, Ref } from 'effect';

// Per-book "last chapter" memory, ephemeral. Lives only for the session
// (in-memory Map) so that switching books in the Library/TOC re-opens each
// book where you last left it instead of always at chapter 1.
//
// Distinct from `LastPositionStorage`, which persists the SINGLE most recent
// (book, chapter, paragraph) tuple to disk for resume-on-launch. This service
// keeps a per-book record so book-hopping within a session feels natural.
//
// Two namespaces:
//   • EGW books — keyed by EGW bookId, value is a chapter para_id (string)
//   • Bible books — keyed by Bible book number, value is a chapter number
//
// Writers are the chapter-open callsites (toc clicks, prev/next, search jumps)
// recording wherever the user lands. Readers are the implicit "open a book
// without specifying a chapter" callsites (`openBookAtFirstChapter`, Bible
// book picker), which consult the memory before falling back to chapter 1.

export interface LastChapterMemoryShape {
  readonly getEgw: (bookId: number) => Effect.Effect<Option.Option<string>>;
  readonly recordEgw: (bookId: number, chapterParaId: string) => Effect.Effect<void>;
  readonly getBible: (book: number) => Effect.Effect<Option.Option<number>>;
  readonly recordBible: (book: number, chapter: number) => Effect.Effect<void>;
}

const make = Effect.gen(function* () {
  const egw = yield* Ref.make<ReadonlyMap<number, string>>(new Map());
  const bible = yield* Ref.make<ReadonlyMap<number, number>>(new Map());
  return {
    getEgw: (bookId) => Ref.get(egw).pipe(Effect.map((m) => Option.fromNullishOr(m.get(bookId)))),
    recordEgw: (bookId, chapterParaId) =>
      Ref.update(egw, (m) => {
        const next = new Map(m);
        next.set(bookId, chapterParaId);
        return next;
      }),
    getBible: (book) => Ref.get(bible).pipe(Effect.map((m) => Option.fromNullishOr(m.get(book)))),
    recordBible: (book, chapter) =>
      Ref.update(bible, (m) => {
        const next = new Map(m);
        next.set(book, chapter);
        return next;
      }),
  } satisfies LastChapterMemoryShape;
});

export class LastChapterMemory extends Context.Service<LastChapterMemory, LastChapterMemoryShape>()(
  '@bible/desktop/services/LastChapterMemory',
) {
  static layer = Layer.effect(LastChapterMemory, make);
}
