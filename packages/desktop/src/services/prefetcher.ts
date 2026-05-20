import type { EGWApiClientError, Schemas } from '@bible/core/egw';
import {
  Context,
  Effect,
  type Fiber,
  FiberHandle,
  Layer,
  Option,
  Stream,
  SubscriptionRef,
} from 'effect';
import { EGWData } from './egw-data.js';
import { ReaderState } from './reader-state.js';

// Chapter warmer. Two entry points sharing one fan-out implementation:
//
//   • start   — long-lived background. Subscribes to ReaderState.changes;
//               on book-open, opportunistically warms every chapter past the
//               first with concurrency 4. Cancels on book-close or
//               book-switch via FiberHandle. The user sees no UI for this
//               unless they peek at the status SubscriptionRef.
//
//   • download — explicit, awaited. Same fan-out, same status updates, but
//                the caller blocks on the returned Effect. Use case: "make
//                this book fully available offline before I start reading."
//                Background prefetch is interrupted while a download runs so
//                they don't race for the same HTTP slots.
//
// Both paths converge on the eventual CacheService (#19). Today the fetched
// chapters are discarded after the schema parse; once the cache layer wraps
// EGWData.getChapter, the same fetch calls will populate sqlite. No call-site
// changes needed when #19 lands.
//
// Why one service rather than two: the orchestration concerns are identical
// (concurrency cap, progress reporting, interrupt-on-change). Forking them
// would mean two FiberHandles competing for HTTP slots and two status refs
// that callers would have to merge.

const PREFETCH_CONCURRENCY = 4;

export type PrefetchStatus =
  | { readonly _tag: 'Idle' }
  | {
      readonly _tag: 'Running';
      readonly mode: 'prefetch' | 'download';
      readonly bookId: number;
      readonly completed: number;
      readonly total: number;
    }
  | {
      readonly _tag: 'Done';
      readonly mode: 'prefetch' | 'download';
      readonly bookId: number;
      readonly total: number;
    }
  | { readonly _tag: 'Failed'; readonly bookId: number; readonly reason: string };

export interface PrefetcherShape {
  readonly status: SubscriptionRef.SubscriptionRef<PrefetchStatus>;
  /** Start the background watcher. Idempotent if called more than once. */
  readonly start: Effect.Effect<void>;
  /**
   * Block until every chapter of `bookId` has been fetched (and, post-#19,
   * cached). Cancels any in-flight background prefetch for the duration.
   * Resolves with the number of chapters warmed.
   */
  readonly download: (bookId: number) => Effect.Effect<number, EGWApiClientError>;
}

const idle: PrefetchStatus = { _tag: 'Idle' };

export const navigableChapters = (toc: readonly Schemas.TocItem[]): readonly Schemas.TocItem[] =>
  toc.filter((t) => t.para_id !== undefined && t.para_id !== null && t.para_id !== '');

export class Prefetcher extends Context.Service<Prefetcher, PrefetcherShape>()(
  '@bible/desktop/services/Prefetcher',
) {
  static layer = Layer.effect(
    Prefetcher,
    Effect.gen(function* () {
      const data = yield* EGWData;
      const state = yield* ReaderState;
      const status = yield* SubscriptionRef.make<PrefetchStatus>(idle);

      // Fan out chapter fetches, threading a completion counter into status.
      // `mode` is metadata for the UI ("downloading…" vs "prefetching…");
      // the underlying work is the same.
      // `chapters` is the slice the caller wants warmed — start() skips the
      // first chapter (the foreground reader handles it), download() warms
      // every chapter.
      const fanOut = (
        mode: 'prefetch' | 'download',
        bookId: number,
        chapters: readonly Schemas.TocItem[],
      ) =>
        Effect.gen(function* () {
          if (chapters.length === 0) {
            yield* SubscriptionRef.set(status, {
              _tag: 'Done',
              mode,
              bookId,
              total: 0,
            } satisfies PrefetchStatus);
            return 0;
          }

          yield* SubscriptionRef.set(status, {
            _tag: 'Running',
            mode,
            bookId,
            completed: 0,
            total: chapters.length,
          } satisfies PrefetchStatus);

          let completed = 0;
          yield* Effect.forEach(
            chapters,
            (toc) =>
              data.getChapter(bookId, toc).pipe(
                Effect.tap(() =>
                  Effect.gen(function* () {
                    completed += 1;
                    yield* SubscriptionRef.set(status, {
                      _tag: 'Running',
                      mode,
                      bookId,
                      completed,
                      total: chapters.length,
                    } satisfies PrefetchStatus);
                  }),
                ),
              ),
            { concurrency: PREFETCH_CONCURRENCY, discard: true },
          );

          yield* SubscriptionRef.set(status, {
            _tag: 'Done',
            mode,
            bookId,
            total: chapters.length,
          } satisfies PrefetchStatus);
          return chapters.length;
        });

      // FiberHandle for the background watcher's per-book prefetch fiber.
      // Lives at module scope so download() can interrupt it via clear()
      // before launching its own foreground work — this prevents the two
      // workflows from doubling up HTTP slots on the same book.
      const prefetchHandle = yield* FiberHandle.make<void, EGWApiClientError>();

      const prefetchForBook = (bookId: number) =>
        Effect.gen(function* () {
          const toc = yield* data.getToc(bookId);
          const chapters = navigableChapters(toc);
          // First chapter rendered foreground → background warms the rest.
          yield* fanOut('prefetch', bookId, chapters.slice(1));
        }).pipe(
          Effect.catch((error) =>
            SubscriptionRef.set(status, {
              _tag: 'Failed',
              bookId,
              reason: error._tag,
            } satisfies PrefetchStatus),
          ),
        );

      const watcher = Effect.gen(function* () {
        // Dedup by bookId — chapter-only changes (set by openChapter) don't
        // restart the prefetch.
        let activeBookId: number | null = null;
        yield* state.changes.pipe(
          Stream.runForEach((selection) =>
            Effect.gen(function* () {
              if (Option.isNone(selection)) {
                activeBookId = null;
                yield* FiberHandle.clear(prefetchHandle);
                yield* SubscriptionRef.set(status, idle);
                return;
              }
              const nextBookId = selection.value.bookId;
              if (activeBookId === nextBookId) return;
              activeBookId = nextBookId;
              yield* FiberHandle.run(prefetchHandle, prefetchForBook(nextBookId));
            }),
          ),
        );
      });

      const download = (bookId: number) =>
        Effect.gen(function* () {
          // Foreground download takes priority over background prefetch.
          yield* FiberHandle.clear(prefetchHandle);
          const toc = yield* data.getToc(bookId);
          const chapters = navigableChapters(toc);
          return yield* fanOut('download', bookId, chapters);
        });

      return {
        status,
        start: watcher,
        download,
      } satisfies PrefetcherShape;
    }),
  );

  /** No-op layer for tests / contexts that don't want background fetches. */
  static layerTest = Layer.effect(
    Prefetcher,
    Effect.gen(function* () {
      const status = yield* SubscriptionRef.make<PrefetchStatus>(idle);
      return {
        status,
        start: Effect.void,
        download: () => Effect.succeed(0),
      } satisfies PrefetcherShape;
    }),
  );
}

// Re-export Fiber here to discourage callers from importing it just to
// interrupt the start fiber — the runtime owns that lifecycle.
export type { Fiber };
