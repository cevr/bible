import { Context, Effect, Layer, Option, type Stream, SubscriptionRef } from 'effect';

// Which Book + Chapter the reader is currently focused on. Lives separately
// from ReaderSettings because settings persist to disk (theme, font, recents)
// while selection is ephemeral session state — when #19's CacheService lands,
// the last-open book/chapter will likely persist there instead, alongside
// progressByChapter.
//
// The shell (app.tsx), the Library rail, the TOC sidebar (#25), and the
// prefetch orchestrator (#24) all read and write this. Backed by
// SubscriptionRef so non-component subscribers (the prefetch fiber, future
// route handlers) can observe selection changes as a Stream instead of
// polling.

// Discriminated by depth. `highlight` carries chapter + paragraph; `chapter`
// just chapter; `book` no chapter yet. Forbids the "book without chapter but
// with highlight" cell the prior shape allowed.
//
// `highlight.paraId` is consumed by the reader on render then cleared via
// `clearHighlight` (collapses the selection back to `chapter`) so a re-open
// of the same chapter doesn't re-scroll.
export type ReaderSelection =
  | { readonly _tag: 'book'; readonly bookId: number }
  | { readonly _tag: 'chapter'; readonly bookId: number; readonly chapterParaId: string }
  | {
      readonly _tag: 'highlight';
      readonly bookId: number;
      readonly chapterParaId: string;
      readonly highlightParaId: string;
    };

export interface ReaderStateShape {
  readonly get: Effect.Effect<Option.Option<ReaderSelection>>;
  readonly changes: Stream.Stream<Option.Option<ReaderSelection>>;
  readonly openBook: (bookId: number) => Effect.Effect<void>;
  readonly openChapter: (bookId: number, chapterParaId: string) => Effect.Effect<void>;
  /**
   * Open a chapter and request the reader scroll/highlight a specific paragraph
   * inside it once it renders. Used by search-result clicks.
   */
  readonly openChapterAt: (
    bookId: number,
    chapterParaId: string,
    highlightParaId: string,
  ) => Effect.Effect<void>;
  /** Acknowledge a highlight after the reader has scrolled to it. */
  readonly clearHighlight: Effect.Effect<void>;
  readonly close: Effect.Effect<void>;
}

const makeImpl = (initial: Option.Option<ReaderSelection>) =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(initial);
    return {
      get: SubscriptionRef.get(ref),
      changes: SubscriptionRef.changes(ref),
      openBook: (bookId: number) =>
        SubscriptionRef.set(ref, Option.some<ReaderSelection>({ _tag: 'book', bookId })),
      openChapter: (bookId: number, chapterParaId: string) =>
        SubscriptionRef.set(
          ref,
          Option.some<ReaderSelection>({ _tag: 'chapter', bookId, chapterParaId }),
        ),
      openChapterAt: (bookId: number, chapterParaId: string, highlightParaId: string) =>
        SubscriptionRef.set(
          ref,
          Option.some<ReaderSelection>({
            _tag: 'highlight',
            bookId,
            chapterParaId,
            highlightParaId,
          }),
        ),
      // Drop the highlight by collapsing to the underlying chapter selection.
      // No-op when the current selection is not in the highlight state.
      clearHighlight: SubscriptionRef.update(ref, (curr) =>
        Option.map(curr, (sel) =>
          sel._tag === 'highlight'
            ? ({ _tag: 'chapter', bookId: sel.bookId, chapterParaId: sel.chapterParaId } as const)
            : sel,
        ),
      ),
      close: SubscriptionRef.set(ref, Option.none<ReaderSelection>()),
    } satisfies ReaderStateShape;
  });

export class ReaderState extends Context.Service<ReaderState, ReaderStateShape>()(
  '@bible/desktop/services/ReaderState',
) {
  static layer = Layer.effect(ReaderState, makeImpl(Option.none()));

  static layerTest = (initial: Option.Option<ReaderSelection> = Option.none()) =>
    Layer.effect(ReaderState, makeImpl(initial));
}
