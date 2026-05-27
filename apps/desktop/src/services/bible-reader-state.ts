import { Context, Effect, Layer, Option, type Stream, SubscriptionRef } from 'effect';

// Bible-mode equivalent of `ReaderState` (the EGW reader). Tracks which
// (book, chapter, verse) the main canvas is focused on while the user is in
// Bible mode. Backed by SubscriptionRef so non-component subscribers (a
// future Bible prefetch fiber, position persistence) can observe changes as
// a Stream instead of polling.
//
// `BibleReaderState` is intentionally separate from `ReaderState`:
// - The two modes preserve their state independently (per the F3 design).
// - The Bible cursor model is (book, chapter, verse), not (bookId, paraId).
// - Verse-level focus is the unit of work for the right-side EGW commentary
//   drawer (F3.5), so it earns first-class status here.

export interface BibleReaderSelection {
  readonly book: number;
  readonly chapter: number;
  /** Verse the user is currently focused on. Drives:
   *  - the right-side EGW commentary drawer
   *  - the inline cursor styling on the verse row
   *  - the canvas scroll-into-view effect (which only acts when the verse is
   *    off-screen, so user clicks on visible verses don't jump the page)
   *  None when no verse has been picked yet (e.g. chapter just opened). */
  readonly verse: Option.Option<number>;
}

export interface BibleReaderStateShape {
  readonly get: Effect.Effect<Option.Option<BibleReaderSelection>>;
  readonly changes: Stream.Stream<Option.Option<BibleReaderSelection>>;
  readonly openChapter: (book: number, chapter: number) => Effect.Effect<void>;
  /** Open a chapter and focus a verse. The canvas's scroll effect brings it
   *  into view when off-screen. */
  readonly openChapterAt: (book: number, chapter: number, verse: number) => Effect.Effect<void>;
  /** Update the verse cursor without changing the chapter. No-op if no
   *  chapter is open. */
  readonly setVerse: (verse: number) => Effect.Effect<void>;
  readonly close: Effect.Effect<void>;
}

const makeImpl = (initial: Option.Option<BibleReaderSelection>) =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(initial);
    return {
      get: SubscriptionRef.get(ref),
      changes: SubscriptionRef.changes(ref),
      openChapter: (book: number, chapter: number) =>
        SubscriptionRef.set(ref, Option.some({ book, chapter, verse: Option.none() })),
      openChapterAt: (book: number, chapter: number, verse: number) =>
        SubscriptionRef.set(ref, Option.some({ book, chapter, verse: Option.some(verse) })),
      setVerse: (verse: number) =>
        SubscriptionRef.update(ref, (curr) =>
          Option.map(curr, (sel) => ({ ...sel, verse: Option.some(verse) })),
        ),
      close: SubscriptionRef.set(ref, Option.none<BibleReaderSelection>()),
    } satisfies BibleReaderStateShape;
  });

export class BibleReaderState extends Context.Service<BibleReaderState, BibleReaderStateShape>()(
  '@bible/desktop/services/BibleReaderState',
) {
  static layer = Layer.effect(BibleReaderState, makeImpl(Option.none()));

  static layerTest = (initial: Option.Option<BibleReaderSelection> = Option.none()) =>
    Layer.effect(BibleReaderState, makeImpl(initial));
}
