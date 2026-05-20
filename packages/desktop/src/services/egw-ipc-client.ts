import {
  chapterIdFromTocItem,
  EGWApiError,
  type EGWApiClientError,
  Schemas,
} from '@bible/core/egw';
import { Context, Effect, Layer, Schema, Stream } from 'effect';

// Renderer-side stand-in for `EGWApiClient`. All HTTP runs in the main
// process (electron/main.ts `egw:fetch*` handlers); this service ferries
// requests across the preload bridge and decodes the JSON payload through
// the same schemas the cache layer uses.
//
// We deliberately don't satisfy the full `EGWApiClientService` interface —
// EGWData + SearchService only need this narrow surface, and shipping
// EGWApiClient itself (which transitively pulls in HttpClient + EGWAuth)
// into the renderer is exactly what we're trying to avoid.

/**
 * Subset of `EGWApiClientService` the renderer actually calls. Matches the
 * method signatures so EGWData.makeLive can be retargeted without changing
 * its call sites.
 */
export interface EGWIpcClientShape {
  readonly getBooks: (params: {
    readonly lang: string;
  }) => Stream.Stream<Schemas.Book, EGWApiClientError>;
  readonly getBookToc: (
    bookId: number,
  ) => Effect.Effect<readonly Schemas.TocItem[], EGWApiClientError>;
  readonly getChapterContent: (
    bookId: number,
    chapterId: string,
  ) => Effect.Effect<readonly Schemas.Paragraph[], EGWApiClientError>;
  readonly search: (params: {
    readonly query: string;
    readonly limit?: number;
  }) => Effect.Effect<Schemas.SearchResponse, EGWApiClientError>;
  readonly getFolders: (
    lang: string,
  ) => Effect.Effect<readonly Schemas.Folder[], EGWApiClientError>;
  readonly getBooksByFolder: (
    folderId: number,
    lang: string,
  ) => Effect.Effect<readonly Schemas.Book[], EGWApiClientError>;
}

// Schemas mirror the main-process encoder shapes (Schema.fromJsonString of
// each payload). Decode failures here are treated the same as a network
// failure — wrapped as EGWApiError so EGWData/SearchService handle them
// through their existing error channels.
const BooksJson = Schema.fromJsonString(Schema.Array(Schemas.Book));
const TocJson = Schema.fromJsonString(Schema.Array(Schemas.TocItem));
const ChapterJson = Schema.fromJsonString(Schema.Array(Schemas.Paragraph));
const SearchJson = Schema.fromJsonString(Schemas.SearchResponse);
const FoldersJson = Schema.fromJsonString(Schema.Array(Schemas.Folder));

const decodeBooks = Schema.decodeUnknownEffect(BooksJson);
const decodeToc = Schema.decodeUnknownEffect(TocJson);
const decodeChapter = Schema.decodeUnknownEffect(ChapterJson);
const decodeSearch = Schema.decodeUnknownEffect(SearchJson);
const decodeFolders = Schema.decodeUnknownEffect(FoldersJson);

// Lift any thrown rejection from the preload bridge (e.g. main-side EGW
// errors that surface as `Error: EGW request failed: ...`) into the
// EGWApiError tagged shape.
const callMain = (
  op: string,
  fn: () => Promise<string>,
): Effect.Effect<string, EGWApiClientError> =>
  Effect.tryPromise({
    try: fn,
    catch: (cause) =>
      new EGWApiError({
        message: `IPC ${op} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  });

// Schema errors from JSON decode get re-wrapped as EGWApiError so callers
// don't have to widen their error channel just to handle the IPC layer.
const mapSchemaError = <A, R>(eff: Effect.Effect<A, Schema.SchemaError, R>) =>
  eff.pipe(
    Effect.mapError(
      (cause): EGWApiClientError =>
        new EGWApiError({ message: `IPC payload decode failed: ${cause.message}`, cause }),
    ),
  );

export class EGWIpcClient extends Context.Service<EGWIpcClient, EGWIpcClientShape>()(
  '@bible/desktop/services/EGWIpcClient',
) {
  static layer = Layer.succeed(EGWIpcClient, {
    getBooks: ({ lang }) =>
      Stream.fromIterableEffect(
        callMain('egw:fetchBooks', () => window.api.egw.fetchBooks(lang)).pipe(
          Effect.flatMap((json) => mapSchemaError(decodeBooks(json))),
        ),
      ),
    getBookToc: (bookId) =>
      callMain('egw:fetchToc', () => window.api.egw.fetchToc(bookId)).pipe(
        Effect.flatMap((json) => mapSchemaError(decodeToc(json))),
      ),
    getChapterContent: (bookId, chapterId) =>
      callMain('egw:fetchChapter', () => window.api.egw.fetchChapter(bookId, chapterId)).pipe(
        Effect.flatMap((json) => mapSchemaError(decodeChapter(json))),
      ),
    search: ({ query, limit }) =>
      callMain('egw:search', () => window.api.egw.search(query, limit)).pipe(
        Effect.flatMap((json) => mapSchemaError(decodeSearch(json))),
      ),
    getFolders: (lang) =>
      callMain('egw:fetchFolders', () => window.api.egw.fetchFolders(lang)).pipe(
        Effect.flatMap((json) => mapSchemaError(decodeFolders(json))),
      ),
    getBooksByFolder: (folderId, lang) =>
      callMain('egw:fetchBooksByFolder', () =>
        window.api.egw.fetchBooksByFolder(folderId, lang),
      ).pipe(Effect.flatMap((json) => mapSchemaError(decodeBooks(json)))),
  });

  /** Test stub — returns empty everything. Override fields for fixtures. */
  static layerTest = (overrides: Partial<EGWIpcClientShape> = {}) =>
    Layer.succeed(EGWIpcClient, {
      getBooks: () => Stream.empty,
      getBookToc: () => Effect.succeed([]),
      getChapterContent: () => Effect.succeed([]),
      search: () => Effect.succeed({ next: null, previous: null, total: 0, count: 0, results: [] }),
      getFolders: () => Effect.succeed([]),
      getBooksByFolder: () => Effect.succeed([]),
      ...overrides,
    });
}

// Re-export for renderer code that needs to construct chapter ids before
// calling getChapterContent (mirrors the convenience the core EGWApiClient
// gave via `chapterIdFromTocItem`).
export { chapterIdFromTocItem };
