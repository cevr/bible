import { Effect, Fiber, Option, Stream, SubscriptionRef } from 'effect';
import {
  type Component,
  createContext,
  createSignal,
  type JSX,
  onCleanup,
  onMount,
  useContext,
} from 'solid-js';
import { runtime, signalFromStream } from '../../runtime.js';
import { EGWData } from '../../services/egw-data.js';
import { Prefetcher, type PrefetchStatus } from '../../services/prefetcher.js';

export type DownloadState =
  | { readonly _tag: 'idle' }
  | { readonly _tag: 'running'; readonly percent: number }
  | { readonly _tag: 'done' };

const IDLE_STATUS: PrefetchStatus = { _tag: 'Idle' };

interface BookDownloadApi {
  /** Live per-book progress derived from the Prefetcher's current status — a
   *  `running` mode and percent while the book is downloading, `done` for the
   *  most recently completed book, `idle` otherwise. */
  readonly downloadStateFor: (bookId: number) => DownloadState;
  /** True iff any download is currently running. Used by row buttons to
   *  disable themselves while another download is in flight. */
  readonly anyDownloadRunning: () => boolean;
  /** Snapshot of cached/expected chapter counts per book. `expected > 0 &&
   *  cached >= expected` ⇒ fully cached for offline reading. */
  readonly isFullyDownloaded: (bookId: number) => boolean;
  /** Kick off a download. Idempotent — the Prefetcher itself ignores
   *  concurrent requests for the same book. */
  readonly downloadBook: (bookId: number) => void;
  /** Eagerly refresh the cache-count for one book. Called by FolderBrowser
   *  whenever a new book list resolves so badges show immediately rather
   *  than waiting for a `Done` event from the Prefetcher. */
  readonly refreshDownloadState: (bookId: number) => void;
}

const BookDownloadContext = createContext<BookDownloadApi>();

// Owns the download surface area for the library: a single Prefetcher status
// subscription, the per-book cached/expected map, and the refresh fibers. The
// rows under FolderBrowser previously took 6 props for this — they now read
// `useBookDownloadState(bookId)` directly. Adding a new download-aware row
// becomes a new consumer, not another prop drill.
export const BookDownloadProvider: Component<{ readonly children: JSX.Element }> = (props) => {
  const status = signalFromStream(
    Effect.gen(function* () {
      const prefetcher = yield* Prefetcher;
      return SubscriptionRef.changes(prefetcher.status);
    }),
    IDLE_STATUS,
  );

  type DownloadCount = { readonly cached: number; readonly expected: number };
  const [downloadStates, setDownloadStates] = createSignal<ReadonlyMap<number, DownloadCount>>(
    new Map(),
  );

  // Tracked refresh fibers keyed by bookId. A new event for the same book
  // interrupts the previous in-flight refresh so a slow `getDownloadState`
  // can't land after a newer status snapshot and write a stale count.
  const refreshFibers = new Map<number, Fiber.Fiber<void>>();
  const refreshDownloadState = (bookId: number): void => {
    const prev = refreshFibers.get(bookId);
    if (prev !== undefined) void runtime.runPromise(Fiber.interrupt(prev));
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const data = yield* EGWData;
        const state = yield* data.getDownloadState(bookId);
        setDownloadStates((prevStates) => {
          const next = new Map(prevStates);
          if (Option.isNone(state)) next.delete(bookId);
          else next.set(bookId, state.value);
          return next;
        });
      }).pipe(
        Effect.ignore,
        Effect.ensuring(
          Effect.sync(() => {
            refreshFibers.delete(bookId);
          }),
        ),
      ),
    );
    refreshFibers.set(bookId, fiber);
  };

  onMount(() => {
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const prefetcher = yield* Prefetcher;
        yield* SubscriptionRef.changes(prefetcher.status).pipe(
          Stream.runForEach((s) =>
            Effect.sync(() => {
              if (s._tag === 'Done' && s.mode === 'download') refreshDownloadState(s.bookId);
            }),
          ),
        );
      }),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
      for (const f of refreshFibers.values()) {
        void runtime.runPromise(Fiber.interrupt(f));
      }
      refreshFibers.clear();
    });
  });

  const downloadBook = (bookId: number): void => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const prefetcher = yield* Prefetcher;
        yield* prefetcher.download(bookId);
      }).pipe(Effect.result),
    );
  };

  const downloadStateFor = (bookId: number): DownloadState => {
    const s = status();
    if (s._tag === 'Running' && s.mode === 'download' && s.bookId === bookId) {
      return {
        _tag: 'running',
        percent: s.total === 0 ? 0 : (s.completed / s.total) * 100,
      };
    }
    if (s._tag === 'Done' && s.mode === 'download' && s.bookId === bookId) {
      return { _tag: 'done' };
    }
    return { _tag: 'idle' };
  };

  const anyDownloadRunning = (): boolean => {
    const s = status();
    return s._tag === 'Running' && s.mode === 'download';
  };

  const isFullyDownloaded = (bookId: number): boolean => {
    const state = downloadStates().get(bookId);
    return state !== undefined && state.expected > 0 && state.cached >= state.expected;
  };

  const api: BookDownloadApi = {
    downloadStateFor,
    anyDownloadRunning,
    isFullyDownloaded,
    downloadBook,
    refreshDownloadState,
  };
  return <BookDownloadContext.Provider value={api}>{props.children}</BookDownloadContext.Provider>;
};

export const useBookDownload = (): BookDownloadApi => {
  const ctx = useContext(BookDownloadContext);
  if (ctx === undefined) {
    throw new Error('useBookDownload must be used inside <BookDownloadProvider>');
  }
  return ctx;
};
