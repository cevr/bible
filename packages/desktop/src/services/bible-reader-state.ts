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
  /** Verse the user is currently focused on. Drives the right-side EGW
   *  commentary drawer and is the anchor we'd persist for resume-on-launch.
   *  None when no verse has been picked yet (e.g. chapter just opened). */
  readonly verse: Option.Option<number>;
  /**
   * When set, the canvas scrolls this verse into view and pulses it after
   * the chapter renders. Used for search-result jumps and cross-mode
   * navigation (e.g. EGW reader → Bible verse). Cleared by the canvas
   * after applying so a re-open of the same chapter doesn't re-scroll.
   */
  readonly highlightVerse: Option.Option<number>;
}

export interface BibleReaderStateShape {
  readonly get: Effect.Effect<Option.Option<BibleReaderSelection>>;
  readonly changes: Stream.Stream<Option.Option<BibleReaderSelection>>;
  readonly openChapter: (book: number, chapter: number) => Effect.Effect<void>;
  /** Open a chapter and request the canvas scroll/highlight a verse once it
   *  renders. The verse is set as both `verse` (current focus) and
   *  `highlightVerse` (one-shot scroll cue). */
  readonly openChapterAt: (book: number, chapter: number, verse: number) => Effect.Effect<void>;
  /** Update the verse cursor without changing the chapter. No-op if no
   *  chapter is open. */
  readonly setVerse: (verse: number) => Effect.Effect<void>;
  /** Acknowledge a highlight after the canvas has scrolled to it. */
  readonly clearHighlight: Effect.Effect<void>;
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
          Option.some({
            book,
            chapter,
            verse: Option.none(),
            highlightVerse: Option.none(),
          }),
        ),
      openChapterAt: (book: number, chapter: number, verse: number) =>
        SubscriptionRef.set(
          ref,
          Option.some({
            book,
            chapter,
            verse: Option.some(verse),
            highlightVerse: Option.some(verse),
          }),
        ),
      setVerse: (verse: number) =>
        SubscriptionRef.update(ref, (curr) =>
          Option.map(curr, (sel) => ({ ...sel, verse: Option.some(verse) })),
        ),
      clearHighlight: SubscriptionRef.update(ref, (curr) =>
        Option.map(curr, (sel) => ({ ...sel, highlightVerse: Option.none() })),
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
