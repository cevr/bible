import { Effect, Fiber, Layer, ManagedRuntime, Stream } from 'effect';
import { type Accessor, from } from 'solid-js';
import { buildIpc } from './ipc-cache/proxy.js';
import { procedures } from './procedures.js';
import { BibleMarginNotes } from './services/bible-margin-notes.js';
import { BibleReaderState } from './services/bible-reader-state.js';
import { BibleXrefs } from './services/bible-xrefs.js';
import { CacheService } from './services/cache-service.js';
import { CommandPaletteMemory } from './services/command-palette-memory.js';
import { EgwCommentary } from './services/egw-commentary.js';
import { EGWData } from './services/egw-data.js';
import { EGWIpcClient } from './services/egw-ipc-client.js';
import { KjvBible } from './services/kjv-bible.js';
import { LastChapterMemory } from './services/last-chapter-memory.js';
import { LastPositionStorage } from './services/last-position-storage.js';
import { Prefetcher } from './services/prefetcher.js';
import { ReaderSettings } from './services/reader-settings.js';
import { ReaderState } from './services/reader-state.js';
import { SearchService } from './services/search-service.js';
import { SettingsStorage } from './services/settings-storage.js';

// Renderer runtime. EGW HTTP runs in the main process — see
// electron/main.ts `egw:fetch*` handlers — so the renderer only needs the
// thin `EGWIpcClient` shim that ferries requests across the preload bridge.
// This is what gets us off browser fetch + CORS preflight failures and
// keeps the OAuth client_secret out of the renderer bundle entirely.
const EGWDataLayer = EGWData.cachedLayer.pipe(
  Layer.provide(EGWIpcClient.layer),
  Layer.provide(CacheService.layer),
);

// Prefetcher needs EGWData + ReaderState. provideMerge keeps both deps in
// the output context AND wires them into Prefetcher's construction — so the
// Prefetcher and the components subscribe to the SAME ReaderState instance,
// not two parallel copies (which mergeAll would produce).
const PrefetcherLayer = Prefetcher.layer.pipe(
  Layer.provideMerge(EGWDataLayer),
  Layer.provideMerge(ReaderState.layer),
);

const SearchServiceLayer = SearchService.layer.pipe(Layer.provide(EGWIpcClient.layer));

const AppLayer = Layer.mergeAll(
  Layer.provide(ReaderSettings.layer, SettingsStorage.layer),
  LastPositionStorage.layer,
  PrefetcherLayer,
  SearchServiceLayer,
  KjvBible.layer,
  BibleXrefs.layer,
  BibleMarginNotes.layer,
  EgwCommentary.layer,
  BibleReaderState.layer,
  LastChapterMemory.layer,
  CommandPaletteMemory.layer,
);

export const runtime = ManagedRuntime.make(AppLayer);

/**
 * Schema-validated, reactive proxy over the renderer's services. Components
 * call `ipc.<namespace>.<method>.query(input)` for cacheable reads (returns
 * a Solid Resource that suspends), or `.mutate(input)` for one-shot writes.
 *
 * The procedure handlers in `./procedures.ts` yield services from this same
 * runtime, so AppLayer's contract is the only thing tying them together —
 * adding a procedure that needs a new service requires extending AppLayer.
 */
export const ipc = buildIpc(procedures, runtime);

/**
 * Bridge an Effect `Stream` into a Solid `Accessor`. The stream is consumed in
 * a fork that lives for the current Solid owner's lifetime — Solid's `from`
 * teardown interrupts the fiber on owner dispose, so callers don't have to
 * thread fiber/onCleanup pairs themselves.
 *
 * The producer Effect runs with the full AppLayer context, so callers can
 * `yield*` any service to assemble the stream.
 *
 * Use this anywhere a component would otherwise mirror a `SubscriptionRef`
 * (or any `Stream`) into a local signal via `Stream.runForEach + setSig`.
 */
export const signalFromStream = <A, R extends AppContext>(
  producer: Effect.Effect<Stream.Stream<A>, never, R>,
  initial: A,
): Accessor<A> =>
  from<A>((set) => {
    const fiber = runtime.runFork(
      producer.pipe(
        Effect.flatMap((stream) =>
          stream.pipe(Stream.runForEach((a) => Effect.sync(() => set(() => a)))),
        ),
      ),
    );
    return (): void => {
      void runtime.runPromise(Fiber.interrupt(fiber));
    };
  }, initial);
type AppContext = ManagedRuntime.ManagedRuntime.Services<typeof runtime>;

// Vite re-evaluates this module on HMR; without disposal the previous runtime
// (and any scoped resources it holds — e.g. the ReaderSettings debounce fiber)
// would leak.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void runtime.dispose();
  });
}
