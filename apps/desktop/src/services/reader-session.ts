import { Effect, Fiber, Option, Schedule, Stream } from 'effect';
import { type Accessor, batch, createMemo, createSignal, onCleanup, onMount } from 'solid-js';

import type { ReaderSettingsApi } from '../components/settings/reader-settings-provider.js';
import { createDebouncedAction } from '../lib/debounced-action.js';
import { runtime, signalFromStream } from '../runtime.js';
import { BibleReaderState, type BibleReaderSelection } from './bible-reader-state.js';
import type { BibleDrawerState } from './bible-drawer-state.js';
import { lastChapterMemory } from './last-chapter-memory.js';
import { type LastPosition, LastPositionStorage } from './last-position-storage.js';
import { openBookAtFirstChapter } from './open-book.js';
import { Prefetcher } from './prefetcher.js';
import { ReaderSettings } from './reader-settings.js';
import { ReaderState, type ReaderSelection } from './reader-state.js';
import {
  decode as decodeUrlHash,
  selectionFromReaders,
  type UrlSelection,
  UrlStateRouter,
} from './url-state-router.js';

export interface ReaderSession {
  readonly mainReady: Accessor<boolean>;
  readonly dismissRuntimeWarning: () => void;
  readonly egwSelection: Accessor<Option.Option<ReaderSelection>>;
  readonly bibleSelection: Accessor<Option.Option<BibleReaderSelection>>;
  readonly bibleTocSelection: Accessor<
    Option.Option<{ readonly book: number; readonly chapter: number }>
  >;
  readonly restoreParagraphId: Accessor<Option.Option<string>>;
  readonly rehydrated: Accessor<boolean>;
  readonly hasEgwBook: () => boolean;
  readonly currentEgwBookId: () => number | null;
  readonly onHighlightApplied: () => void;
  readonly onParagraphScrolledIntoView: (chapterParaId: string, paragraphParaId: string) => void;
}

export const createReaderSession = (options: {
  readonly settings: ReaderSettingsApi;
  readonly bibleDrawer: BibleDrawerState;
}): ReaderSession => {
  const { settings, bibleDrawer } = options;

  // True once the main-process Effect runtime is up. Assume ready until the
  // diagnostic poll says otherwise so first paint is not gated on IPC.
  const [mainReady, setMainReady] = createSignal<boolean>(true);

  // Reader selections mirrored from their Effect state machines.
  const [egwSelection, setEgwSelection] = createSignal<Option.Option<ReaderSelection>>(
    Option.none(),
  );
  const bibleSelection = signalFromStream(
    Effect.gen(function* () {
      const state = yield* BibleReaderState;
      return state.changes;
    }),
    Option.none<BibleReaderSelection>(),
  );
  const bibleTocSelection = createMemo(() => {
    const selection = bibleSelection();
    if (Option.isNone(selection)) {
      return Option.none<{ readonly book: number; readonly chapter: number }>();
    }
    return Option.some({ book: selection.value.book, chapter: selection.value.chapter });
  });

  const [restoreParagraphId, setRestoreParagraphId] = createSignal<Option.Option<string>>(
    Option.none(),
  );
  let latestAnchorParaId: string | null = null;
  let pendingRestoreEmit = false;
  const [rehydrated, setRehydrated] = createSignal(false);

  onMount(() => {
    // Poll main readiness once per second until it succeeds.
    const checkReady = Effect.tryPromise(() => window.api.diag.runtimeReady()).pipe(
      Effect.orElseSucceed(() => false),
      Effect.tap((ready) => Effect.sync(() => setMainReady(ready))),
    );
    const pollFiber = runtime.runFork(
      checkReady.pipe(
        Effect.repeat({
          schedule: Schedule.spaced('1 second'),
          until: (ready: boolean) => ready,
        }),
      ),
    );
    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(pollFiber));
    });

    // Seed the drawer tab without persisting the same value back on launch.
    const drawerSeedFiber = runtime.runFork(
      Effect.gen(function* () {
        const service = yield* ReaderSettings;
        const state = yield* service.get;
        bibleDrawer.seedActiveStudyTab(state.bibleStudyTab);
      }),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(drawerSeedFiber));
    });

    // URL state has boot precedence over the persisted position for the mode
    // named by the hash. The other mode still rehydrates from storage.
    const bootUrlSelection: Option.Option<UrlSelection> = decodeUrlHash(window.location.hash);
    const urlSelectsBible =
      Option.isSome(bootUrlSelection) &&
      (bootUrlSelection.value._tag === 'bible-chapter' ||
        bootUrlSelection.value._tag === 'bible-verse');
    const urlSelectsEgw =
      Option.isSome(bootUrlSelection) &&
      (bootUrlSelection.value._tag === 'egw-book' ||
        bootUrlSelection.value._tag === 'egw-chapter' ||
        bootUrlSelection.value._tag === 'egw-highlight');
    if (urlSelectsBible) settings.setReaderMode('bible');
    if (urlSelectsEgw) settings.setReaderMode('egw');

    const egwRehydrateFiber = runtime.runFork(
      Effect.gen(function* () {
        if (urlSelectsEgw && Option.isSome(bootUrlSelection)) {
          const url = bootUrlSelection.value;
          const state = yield* ReaderState;
          if (url._tag === 'egw-book') {
            yield* openBookAtFirstChapter(url.bookId);
          } else if (url._tag === 'egw-chapter') {
            yield* state.openChapter(url.bookId, url.chapterParaId);
          } else {
            setRestoreParagraphId(Option.some(url.highlightParaId));
            latestAnchorParaId = url.highlightParaId;
            pendingRestoreEmit = true;
            yield* state.openChapterAt(url.bookId, url.chapterParaId, url.highlightParaId);
          }
          setRehydrated(true);
          return;
        }

        const storage = yield* LastPositionStorage;
        const restored = yield* storage.read;
        if (Option.isNone(restored)) {
          setRehydrated(true);
          return;
        }
        const position = restored.value;
        if (position._tag === 'paragraph') {
          setRestoreParagraphId(Option.some(position.paragraphId));
          latestAnchorParaId = position.paragraphId;
          pendingRestoreEmit = true;
        }
        if (position._tag === 'book') {
          yield* openBookAtFirstChapter(position.bookId);
        } else {
          const state = yield* ReaderState;
          yield* state.openChapter(position.bookId, position.paraId);
        }
        setRehydrated(true);
      }).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            console.error('[rehydrate] EGW position failed', error);
            setRehydrated(true);
          }),
        ),
        Effect.ignore,
      ),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(egwRehydrateFiber));
    });

    // Mirror EGW changes before persisting them, preserving restore-anchor
    // batching so a keyed reader remount cannot observe a stale anchor.
    const egwFiber = runtime.runFork(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        const storage = yield* LastPositionStorage;
        yield* state.changes.pipe(
          Stream.runForEach((next) =>
            Effect.gen(function* () {
              const previous = egwSelection();
              const previousSelection = Option.getOrUndefined(previous);
              const nextChapterParaId = Option.isSome(next)
                ? next.value._tag === 'book'
                  ? null
                  : next.value.chapterParaId
                : null;
              const previousChapterParaId =
                previousSelection !== undefined && previousSelection._tag !== 'book'
                  ? previousSelection.chapterParaId
                  : null;
              const sameChapter =
                Option.isSome(next) &&
                previousSelection !== undefined &&
                previousSelection.bookId === next.value.bookId &&
                previousChapterParaId !== null &&
                nextChapterParaId !== null &&
                previousChapterParaId === nextChapterParaId;
              const shouldClearRestore =
                Option.isNone(next) || (!sameChapter && !pendingRestoreEmit);
              if (shouldClearRestore) latestAnchorParaId = null;
              batch(() => {
                setEgwSelection(next);
                if (shouldClearRestore) setRestoreParagraphId(Option.none());
              });
              pendingRestoreEmit = false;

              if (Option.isNone(next)) {
                yield* storage.clear;
              } else {
                const selection = next.value;
                const position: LastPosition =
                  selection._tag === 'book'
                    ? { _tag: 'book', bookId: selection.bookId }
                    : latestAnchorParaId === null
                      ? {
                          _tag: 'chapter',
                          bookId: selection.bookId,
                          paraId: selection.chapterParaId,
                        }
                      : {
                          _tag: 'paragraph',
                          bookId: selection.bookId,
                          paraId: selection.chapterParaId,
                          paragraphId: latestAnchorParaId,
                        };
                yield* storage.write(position);
                if (selection._tag !== 'book') {
                  lastChapterMemory.recordEgw(selection.bookId, selection.chapterParaId);
                }
              }
            }),
          ),
        );
      }),
    );

    const bibleRehydrateFiber = runtime.runFork(
      Effect.gen(function* () {
        if (urlSelectsBible && Option.isSome(bootUrlSelection)) {
          const url = bootUrlSelection.value;
          const state = yield* BibleReaderState;
          if (url._tag === 'bible-verse') {
            yield* state.openChapterAt(url.book, url.chapter, url.verse);
          } else if (url._tag === 'bible-chapter') {
            yield* state.openChapter(url.book, url.chapter);
          }
          return;
        }
        const storage = yield* LastPositionStorage;
        const restored = yield* storage.readBible;
        if (Option.isNone(restored)) return;
        const position = restored.value;
        const state = yield* BibleReaderState;
        if (position._tag === 'verse') {
          yield* state.openChapterAt(position.book, position.chapter, position.verse);
        } else {
          yield* state.openChapter(position.book, position.chapter);
        }
      }).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            console.error('[rehydrate] bible position failed', error);
          }),
        ),
        Effect.ignore,
      ),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(bibleRehydrateFiber));
    });

    const bibleFiber = runtime.runFork(
      Effect.gen(function* () {
        const state = yield* BibleReaderState;
        const storage = yield* LastPositionStorage;
        yield* state.changes.pipe(
          Stream.runForEach((next) =>
            Effect.gen(function* () {
              if (Option.isNone(next)) {
                yield* storage.clearBible;
              } else {
                const selection = next.value;
                yield* storage.writeBible(
                  selection._tag === 'verse'
                    ? {
                        _tag: 'verse',
                        book: selection.book,
                        chapter: selection.chapter,
                        verse: selection.verse,
                      }
                    : {
                        _tag: 'chapter',
                        book: selection.book,
                        chapter: selection.chapter,
                      },
                );
                lastChapterMemory.recordBible(selection.book, selection.chapter);
              }
            }),
          ),
        );
      }),
    );

    const prefetchFiber = runtime.runFork(
      Effect.gen(function* () {
        const prefetcher = yield* Prefetcher;
        yield* prefetcher.start;
      }),
    );

    const urlMirrorFiber = runtime.runFork(
      Effect.gen(function* () {
        const router = yield* UrlStateRouter;
        const egwState = yield* ReaderState;
        const bibleState = yield* BibleReaderState;
        const settingsService = yield* ReaderSettings;
        const modes = settingsService.changes.pipe(
          Stream.map((state) => ({ _tag: 'mode' as const, state })),
        );
        const egws = egwState.changes.pipe(
          Stream.map((state) => ({ _tag: 'egw' as const, state })),
        );
        const bibles = bibleState.changes.pipe(
          Stream.map((state) => ({ _tag: 'bible' as const, state })),
        );
        yield* Stream.merge(modes, Stream.merge(egws, bibles)).pipe(
          Stream.runForEach(() =>
            Effect.gen(function* () {
              const settingsSnapshot = yield* settingsService.get;
              const egwSnapshot = yield* egwState.get;
              const bibleSnapshot = yield* bibleState.get;
              yield* router.write(
                selectionFromReaders(settingsSnapshot.readerMode, egwSnapshot, bibleSnapshot),
              );
            }),
          ),
        );
      }),
    );

    const popstateFiber = runtime.runFork(
      Effect.gen(function* () {
        const router = yield* UrlStateRouter;
        const egwState = yield* ReaderState;
        const bibleState = yield* BibleReaderState;
        yield* router.popstate.pipe(
          Stream.runForEach((selection) =>
            Effect.gen(function* () {
              if (Option.isNone(selection)) return;
              const url = selection.value;
              if (url._tag === 'bible-chapter') {
                settings.setReaderMode('bible');
                yield* bibleState.openChapter(url.book, url.chapter);
              } else if (url._tag === 'bible-verse') {
                settings.setReaderMode('bible');
                yield* bibleState.openChapterAt(url.book, url.chapter, url.verse);
              } else if (url._tag === 'egw-book') {
                settings.setReaderMode('egw');
                yield* openBookAtFirstChapter(url.bookId);
              } else if (url._tag === 'egw-chapter') {
                settings.setReaderMode('egw');
                yield* egwState.openChapter(url.bookId, url.chapterParaId);
              } else {
                settings.setReaderMode('egw');
                yield* egwState.openChapterAt(url.bookId, url.chapterParaId, url.highlightParaId);
              }
            }),
          ),
        );
      }),
    );

    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(egwFiber));
      void runtime.runPromise(Fiber.interrupt(bibleFiber));
      void runtime.runPromise(Fiber.interrupt(prefetchFiber));
      void runtime.runPromise(Fiber.interrupt(urlMirrorFiber));
      void runtime.runPromise(Fiber.interrupt(popstateFiber));
    });
  });

  // Track short shell-level writes so HMR/unmount cannot truncate the last
  // highlight or scroll-position intent.
  const writeFibers = new Set<Fiber.Fiber<void>>();
  onCleanup(() => {
    const pending = [...writeFibers];
    if (pending.length === 0) return;
    void runtime.runPromise(Fiber.joinAll(pending).pipe(Effect.ignore));
    writeFibers.clear();
  });
  const forkWrite = (
    effect: Effect.Effect<void, unknown, ReaderState | LastPositionStorage>,
  ): void => {
    const fiber = runtime.runFork(
      effect.pipe(
        Effect.tapError(Effect.logError),
        Effect.ignore,
        Effect.ensuring(
          Effect.sync(() => {
            writeFibers.delete(fiber);
          }),
        ),
      ),
    );
    writeFibers.add(fiber);
  };

  const onHighlightApplied = (): void => {
    forkWrite(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        yield* state.clearHighlight;
      }),
    );
  };

  interface PositionPayload {
    readonly bookId: number;
    readonly chapterParaId: string;
    readonly paragraphParaId: string;
  }
  let pendingChapterKey: string | undefined;
  const positionWriter = createDebouncedAction<PositionPayload>((payload) => {
    pendingChapterKey = undefined;
    forkWrite(
      Effect.gen(function* () {
        const storage = yield* LastPositionStorage;
        yield* storage.write({
          _tag: 'paragraph',
          bookId: payload.bookId,
          paraId: payload.chapterParaId,
          paragraphId: payload.paragraphParaId,
        });
      }),
    );
  }, 250);
  const chapterKeyOf = (bookId: number, chapterParaId: string): string =>
    `${String(bookId)}:${chapterParaId}`;
  const onParagraphScrolledIntoView = (chapterParaId: string, paragraphParaId: string): void => {
    latestAnchorParaId = paragraphParaId;
    const selection = egwSelection();
    if (Option.isNone(selection)) return;
    const bookId = selection.value.bookId;
    const nextKey = chapterKeyOf(bookId, chapterParaId);
    if (pendingChapterKey !== undefined && pendingChapterKey !== nextKey) {
      positionWriter.flush();
    }
    pendingChapterKey = nextKey;
    positionWriter.schedule({ bookId, chapterParaId, paragraphParaId });
  };

  onMount(() => {
    const onUnload = (): void => positionWriter.flush();
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    onCleanup(() => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
    });
  });

  return {
    mainReady,
    dismissRuntimeWarning: () => setMainReady(true),
    egwSelection,
    bibleSelection,
    bibleTocSelection,
    restoreParagraphId,
    rehydrated,
    hasEgwBook: () => Option.isSome(egwSelection()),
    currentEgwBookId: () => {
      const selection = egwSelection();
      return Option.isSome(selection) ? selection.value.bookId : null;
    },
    onHighlightApplied,
    onParagraphScrolledIntoView,
  };
};
