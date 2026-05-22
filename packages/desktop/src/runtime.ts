import { Layer, ManagedRuntime } from 'effect';
import { BibleXrefs } from './services/bible-xrefs.js';
import { CacheService } from './services/cache-service.js';
import { EGWData } from './services/egw-data.js';
import { EGWIpcClient } from './services/egw-ipc-client.js';
import { KjvBible } from './services/kjv-bible.js';
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
);

export const runtime = ManagedRuntime.make(AppLayer);

// Vite re-evaluates this module on HMR; without disposal the previous runtime
// (and any scoped resources it holds — e.g. the ReaderSettings debounce fiber)
// would leak.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void runtime.dispose();
  });
}
