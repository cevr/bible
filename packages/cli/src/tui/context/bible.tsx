// @effect-diagnostics strictBooleanExpressions:off strictEffectProvide:off
import { Effect } from 'effect';
import {
  createContext,
  createResource,
  Show,
  useContext,
  type ParentProps,
  type Resource,
} from 'solid-js';

import { BibleData } from '../../data/bible/data.js';
import type { BibleDataSyncService } from '../../data/bible/types.js';
import { BibleState, type BibleStateService } from '../../data/bible/state.js';
import { useAppRuntime, type AppServices } from '../lib/index.js';

// Combined services for the Bible viewer
interface BibleContextValue {
  ready: Resource<boolean>;
  isLoading: () => boolean;
  error: () => Error | undefined;
  data: BibleDataSyncService;
  state: BibleStateService;
}

const BibleContext = createContext<BibleContextValue>();

export function BibleProvider(props: ParentProps) {
  const runtime = useAppRuntime<AppServices>();
  const runSync = <A, E>(effect: Effect.Effect<A, E, AppServices>) => runtime.runSync(effect);

  // Get services from the app runtime (scope stays alive)
  const [services] = createResource(async () => {
    const data = await runtime.runPromise(
      Effect.gen(function* () {
        return yield* BibleData;
      }),
    );
    const state = await runtime.runPromise(
      Effect.gen(function* () {
        return yield* BibleState;
      }),
    );
    return { data, state };
  });

  // Create sync wrapper that runs Effects synchronously
  // This works because the database connection is already open after init
  const createSyncWrapper = (): BibleDataSyncService => {
    const svc = services();
    if (!svc) {
      // Return stub that returns empty results while loading
      return {
        getBooks: () => [],
        getBook: () => undefined,
        getChapter: () => [],
        getVerse: () => undefined,
        searchVerses: () => [],
        parseReference: () => undefined,
        getNextChapter: () => undefined,
        getPrevChapter: () => undefined,
      };
    }

    return {
      getBooks: () => runSync(svc.data.getBooks()),
      getBook: (n) => runSync(svc.data.getBook(n)),
      getChapter: (b, c) => runSync(svc.data.getChapter(b, c)),
      getVerse: (b, c, v) => runSync(svc.data.getVerse(b, c, v)),
      searchVerses: (q, l) => runSync(svc.data.searchVerses(q, l)),
      parseReference: (ref) => svc.data.parseReference(ref),
      getNextChapter: (b, c) => svc.data.getNextChapter(b, c),
      getPrevChapter: (b, c) => svc.data.getPrevChapter(b, c),
    };
  };

  const value: BibleContextValue = {
    ready: services as Resource<boolean>,
    isLoading: () => services.loading,
    error: () => services.error as Error | undefined,
    get data() {
      return createSyncWrapper();
    },
    get state() {
      const svc = services();
      if (!svc) {
        throw new Error('Bible services not initialized');
      }
      return svc.state;
    },
  };

  return (
    <BibleContext.Provider value={value}>
      <Show
        when={services()}
        fallback={
          <box>
            <text>Loading...</text>
          </box>
        }
      >
        {props.children}
      </Show>
    </BibleContext.Provider>
  );
}

export function useBible(): BibleContextValue {
  const context = useContext(BibleContext);
  if (!context) {
    throw new Error('useBible must be used within a BibleProvider');
  }
  return context;
}

// Convenience hooks
export function useBibleData(): BibleDataSyncService {
  return useBible().data;
}

export function useBibleState(): BibleStateService {
  return useBible().state;
}
