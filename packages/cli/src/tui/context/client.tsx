// @effect-diagnostics strictBooleanExpressions:off
/**
 * ClientProvider - Unified RPC-style client for Bible and EGW services
 *
 * Provides a reactive client interface backed by core services.
 * Uses the centralized app runtime with Result ADT for async state.
 */

import {
  BibleService,
  type Book,
  type ChapterResponse,
  type SearchResult as BibleSearchResult,
} from '@bible/core/bible-service';
import {
  EGWService,
  type EGWBook,
  type EGWChapter,
  type EGWPageResponse,
  type EGWSearchResult,
} from '@bible/core/egw-service';
import { Effect, Option } from 'effect';
import { createContext, useContext, type Accessor, type ParentProps } from 'solid-js';

import { useAppRuntime, useEffectRunner, type ResultType } from '../lib/index.js';

// ============================================================================
// Bible Client
// ============================================================================

export interface BibleClient {
  /** Books list */
  readonly books: Accessor<ResultType<readonly Book[], unknown>>;
  /** Load books */
  readonly loadBooks: () => void;
  /** Current chapter */
  readonly chapter: Accessor<ResultType<ChapterResponse, unknown>>;
  /** Load chapter */
  readonly loadChapter: (book: number, chapter: number) => void;
  /** Search results */
  readonly searchResults: Accessor<ResultType<readonly BibleSearchResult[], unknown>>;
  /** Search */
  readonly search: (query: string, limit?: number) => void;
  /** Get book by number (async with runtime) */
  readonly getBook: (bookNum: number) => Promise<Book | undefined>;
}

// ============================================================================
// EGW Client
// ============================================================================

export interface EGWClient {
  /** Books list */
  readonly books: Accessor<ResultType<readonly EGWBook[], unknown>>;
  /** Load books */
  readonly loadBooks: () => void;
  /** Current page */
  readonly page: Accessor<ResultType<EGWPageResponse | null, unknown>>;
  /** Load page */
  readonly loadPage: (bookCode: string, page: number) => void;
  /** Chapters (table of contents) */
  readonly chapters: Accessor<ResultType<readonly EGWChapter[], unknown>>;
  /** Load chapters */
  readonly loadChapters: (bookCode: string) => void;
  /** Search results */
  readonly searchResults: Accessor<ResultType<readonly EGWSearchResult[], unknown>>;
  /** Search */
  readonly search: (query: string, limit?: number, bookCode?: string) => void;
  /** Get book by code (async with runtime) */
  readonly getBook: (bookCode: string) => Promise<EGWBook | undefined>;
}

// ============================================================================
// Combined Client Context
// ============================================================================

export interface ClientContextValue {
  readonly bible: BibleClient;
  readonly egw: EGWClient;
}

const ClientContext = createContext<ClientContextValue>();

/**
 * Client Provider
 *
 * Must be used within RuntimeProvider.
 *
 * @example
 * ```tsx
 * <RuntimeProvider runtime={runtime}>
 *   <ClientProvider>
 *     <BibleView />
 *     <EGWView />
 *   </ClientProvider>
 * </RuntimeProvider>
 * ```
 */
export function ClientProvider(props: ParentProps) {
  const runtime = useAppRuntime();

  // ============================================================================
  // Bible Client
  // ============================================================================

  const [bibleBooks, loadBibleBooks] = useEffectRunner(runtime, () =>
    Effect.gen(function* () {
      const service = yield* BibleService;
      return yield* service.getBooks();
    }),
  );

  const [bibleChapter, loadBibleChapter] = useEffectRunner(
    runtime,
    (book: number, chapter: number) =>
      Effect.gen(function* () {
        const service = yield* BibleService;
        return yield* service.getChapter(book, chapter);
      }),
  );

  const [bibleSearchResults, searchBible] = useEffectRunner(
    runtime,
    (query: string, limit: number = 50) =>
      Effect.gen(function* () {
        const service = yield* BibleService;
        return yield* service.search(query, limit);
      }),
  );

  const getBibleBook = (bookNum: number): Promise<Book | undefined> =>
    runtime.runPromise(
      Effect.gen(function* () {
        const service = yield* BibleService;
        const opt = yield* service.getBook(bookNum);
        return Option.getOrUndefined(opt);
      }),
    );

  const bibleClient: BibleClient = {
    books: bibleBooks,
    loadBooks: loadBibleBooks,
    chapter: bibleChapter,
    loadChapter: loadBibleChapter,
    searchResults: bibleSearchResults,
    search: searchBible,
    getBook: getBibleBook,
  };

  // ============================================================================
  // EGW Client
  // ============================================================================

  const [egwBooks, loadEgwBooks] = useEffectRunner(runtime, () =>
    Effect.gen(function* () {
      const service = yield* EGWService;
      return yield* service.getBooks();
    }),
  );

  const [egwPage, loadEgwPage] = useEffectRunner(runtime, (bookCode: string, page: number) =>
    Effect.gen(function* () {
      const service = yield* EGWService;
      return yield* service.getPage(bookCode, page);
    }),
  );

  const [egwChapters, loadEgwChapters] = useEffectRunner(runtime, (bookCode: string) =>
    Effect.gen(function* () {
      const service = yield* EGWService;
      return yield* service.getChapters(bookCode);
    }),
  );

  const [egwSearchResults, searchEgw] = useEffectRunner(
    runtime,
    (query: string, limit: number = 50, bookCode?: string) =>
      Effect.gen(function* () {
        const service = yield* EGWService;
        return yield* service.search(query, limit, bookCode);
      }),
  );

  const getEgwBook = (bookCode: string): Promise<EGWBook | undefined> =>
    runtime.runPromise(
      Effect.gen(function* () {
        const service = yield* EGWService;
        const opt = yield* service.getBook(bookCode);
        return Option.getOrUndefined(opt);
      }),
    );

  const egwClient: EGWClient = {
    books: egwBooks,
    loadBooks: loadEgwBooks,
    page: egwPage,
    loadPage: loadEgwPage,
    chapters: egwChapters,
    loadChapters: loadEgwChapters,
    searchResults: egwSearchResults,
    search: searchEgw,
    getBook: getEgwBook,
  };

  // ============================================================================
  // Context Value
  // ============================================================================

  const value: ClientContextValue = {
    bible: bibleClient,
    egw: egwClient,
  };

  return <ClientContext.Provider value={value}>{props.children}</ClientContext.Provider>;
}

/**
 * Hook to access the unified client
 */
export function useClient(): ClientContextValue {
  const context = useContext(ClientContext);
  if (!context) {
    throw new Error('useClient must be used within a ClientProvider');
  }
  return context;
}

/**
 * Hook to access the Bible client
 */
export function useBibleClient(): BibleClient {
  return useClient().bible;
}

/**
 * Hook to access the EGW client
 */
export function useEGWClient(): EGWClient {
  return useClient().egw;
}
