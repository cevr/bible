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

// Discriminated by depth. `verse` exists only on the `verse` variant; the
// `chapter` variant forbids the "chapter open with a floating verse" combo
// the prior shape allowed. Drives:
//   - the right-side EGW commentary drawer
//   - the inline cursor styling on the verse row
//   - the canvas scroll-into-view effect (which only acts when the verse is
//     off-screen, so user clicks on visible verses don't jump the page)
export type BibleReaderSelection =
  | { readonly _tag: 'chapter'; readonly book: number; readonly chapter: number }
  | {
      readonly _tag: 'verse';
      readonly book: number;
      readonly chapter: number;
      readonly verse: number;
    };

export interface BibleReaderStateShape {
  readonly get: Effect.Effect<Option.Option<BibleReaderSelection>>;
  readonly changes: Stream.Stream<Option.Option<BibleReaderSelection>>;
  readonly openChapter: (book: number, chapter: number) => Effect.Effect<void>;
  /** Open a chapter and focus a verse. The canvas's scroll effect brings it
   *  into view when off-screen. */
  readonly openChapterAt: (book: number, chapter: number, verse: number) => Effect.Effect<void>;
  /** Focus a verse within the currently-open chapter. No-op if no chapter
   *  is open. Named after the user action ("focused verse N"), not the
   *  underlying field write. */
  readonly focusVerse: (verse: number) => Effect.Effect<void>;
  readonly close: Effect.Effect<void>;
}

const makeImpl = (initial: Option.Option<BibleReaderSelection>) =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(initial);
    return {
      get: SubscriptionRef.get(ref),
      changes: SubscriptionRef.changes(ref),
      openChapter: (book: number, chapter: number) =>
        SubscriptionRef.set(
          ref,
          Option.some<BibleReaderSelection>({ _tag: 'chapter', book, chapter }),
        ),
      openChapterAt: (book: number, chapter: number, verse: number) =>
        SubscriptionRef.set(
          ref,
          Option.some<BibleReaderSelection>({ _tag: 'verse', book, chapter, verse }),
        ),
      // Raises the chapter selection to a verse selection; no-op when no
      // chapter is open.
      focusVerse: (verse: number) =>
        SubscriptionRef.update(ref, (curr) =>
          Option.map(
            curr,
            (sel): BibleReaderSelection => ({
              _tag: 'verse',
              book: sel.book,
              chapter: sel.chapter,
              verse,
            }),
          ),
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
