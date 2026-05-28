import { EGWApiError, type EGWApiClientError, Schemas } from '@bible/core/egw';
import { Context, Effect, Layer, Option, Schema, Stream } from 'effect';
import { CacheService } from './cache-service.js';
import { chapterIdFromTocItem, EGWIpcClient, type EGWIpcClientShape } from './egw-ipc-client.js';

// Thin renderer-side facade over @bible/core/egw. Three reasons it exists
// rather than calling EGWApiClient directly from components:
//   1. Collapses the EGW `getBooks` Stream into an Effect<readonly Book[]>.
//      Components want a list, not a stream.
//   2. Encapsulates the `chapterIdFromTocItem` derivation so callers pass a
//      TocItem (which is what they have from the TOC sidebar), not a raw
//      chapter id string.
//   3. Gives the CacheService a single seam to wrap — see `cachedLayer`
//      below, which is the production wiring.
export interface EGWDataShape {
  readonly listBooks: (lang: string) => Effect.Effect<readonly Schemas.Book[], EGWApiClientError>;
  readonly getToc: (bookId: number) => Effect.Effect<readonly Schemas.TocItem[], EGWApiClientError>;
  readonly getChapter: (
    bookId: number,
    toc: Schemas.TocItem,
  ) => Effect.Effect<readonly Schemas.Paragraph[], EGWApiClientError>;
  /**
   * Convenience for callers that hold a para_id (e.g. ReaderState) rather than
   * a TocItem. Fetches the TOC, finds the matching item, then delegates to
   * getChapter. The TOC fetch is normally hot in the HttpClient response cache
   * (or — with cachedLayer — in sqlite) after the TocSidebar has loaded.
   */
  readonly getChapterByParaId: (
    bookId: number,
    paraId: string,
  ) => Effect.Effect<readonly Schemas.Paragraph[], EGWApiClientError>;
  /**
   * Cache-only inspection: how many chapters of `bookId` are cached, and how
   * many the book has in total (from the cached TOC). Returns `none` when the
   * TOC isn't cached (i.e. the book has never been opened) — without the TOC
   * we don't know the denominator. No network calls. Used by LibraryRail to
   * render a "downloaded ✓" badge without forcing a TOC fetch for every book.
   */
  readonly getDownloadState: (
    bookId: number,
  ) => Effect.Effect<Option.Option<{ readonly cached: number; readonly expected: number }>>;
  /**
   * Resolve a paragraph (identified by its `puborder` within `bookId`) to the
   * chapter that contains it. Search hits give us a paragraph paraId + puborder;
   * to navigate the reader we need the *chapter*'s paraId. This finds the
   * navigable TOC item with the greatest `puborder <= paragraphPuborder`.
   * Returns `none` when the TOC has no navigable items or the paragraph
   * precedes the first chapter.
   */
  readonly findContainingChapter: (
    bookId: number,
    paragraphPuborder: number,
  ) => Effect.Effect<Option.Option<Schemas.TocItem>, EGWApiClientError>;
  /**
   * Folder tree for a language. Recursive — each Folder may have children.
   * Cached per-lang because the response is monolithic (the whole tree comes
   * back from one call) and rarely changes.
   */
  readonly listFolders: (
    lang: string,
  ) => Effect.Effect<readonly Schemas.Folder[], EGWApiClientError>;
  /**
   * Books inside a single folder. Cached by (folder_id, lang) because the EGW
   * endpoint is filterable by language.
   */
  readonly listBooksByFolder: (
    folderId: number,
    lang: string,
  ) => Effect.Effect<readonly Schemas.Book[], EGWApiClientError>;
}

// Schemas used for cache (de)serialization. Each is `fromJsonString` of the
// shape the EGW client returns, so the same bytes that came from HTTP round-trip
// through sqlite without losing type fidelity. A decode failure surfaces as
// SchemaError — already in EGWApiClientError — so callers handle cache rot the
// same way they'd handle a live-response shape change.
const BooksJson = Schema.fromJsonString(Schema.Array(Schemas.Book));
const TocJson = Schema.fromJsonString(Schema.Array(Schemas.TocItem));
const ChapterJson = Schema.fromJsonString(Schema.Array(Schemas.Paragraph));
const FoldersJson = Schema.fromJsonString(Schema.Array(Schemas.Folder));

const decodeBooks = Schema.decodeUnknownEffect(BooksJson);
const encodeBooks = Schema.encodeEffect(BooksJson);
const decodeToc = Schema.decodeUnknownEffect(TocJson);
const encodeToc = Schema.encodeEffect(TocJson);
const decodeChapter = Schema.decodeUnknownEffect(ChapterJson);
const encodeChapter = Schema.encodeEffect(ChapterJson);
const decodeFolders = Schema.decodeUnknownEffect(FoldersJson);
const encodeFolders = Schema.encodeEffect(FoldersJson);

// Cache key for a chapter — para_id when present, puborder as fallback. Stable
// across both getChapter (which has a TocItem) and getChapterByParaId (which
// has a para_id string).
const chapterCacheKey = (toc: Schemas.TocItem): string =>
  Option.getOrElse(toc.para_id, () => String(toc.puborder));

// Mirrors Prefetcher's `navigableChapters` filter — both must agree on what
// counts as a fetchable chapter for the "downloaded" badge denominator to
// equal what the Prefetcher actually warms.
const countNavigable = (toc: readonly Schemas.TocItem[]): number =>
  toc.reduce((n, t) => (Option.isSome(t.para_id) ? n + 1 : n), 0);

// Find the navigable TOC item whose puborder is the greatest <= paragraphPuborder.
// TOC items aren't guaranteed sorted by puborder in the response, so a linear
// scan picking the max is more robust than relying on order.
const findChapterForPuborder = (
  toc: readonly Schemas.TocItem[],
  paragraphPuborder: number,
): Option.Option<Schemas.TocItem> => {
  let best: Schemas.TocItem | null = null;
  for (const item of toc) {
    if (Option.isNone(item.para_id)) continue;
    if (item.puborder > paragraphPuborder) continue;
    if (best === null || item.puborder > best.puborder) best = item;
  }
  return best === null ? Option.none() : Option.some(best);
};

export class EGWData extends Context.Service<EGWData, EGWDataShape>()(
  '@bible/desktop/services/EGWData',
) {
  // Live layer — no caching. Direct passthrough to the IPC client. Useful
  // when running outside Electron (web preview, tests) only if a test
  // EGWIpcClient is provided.
  static layer = Layer.effect(
    EGWData,
    Effect.gen(function* () {
      const client = yield* EGWIpcClient;
      return makeLive(client);
    }),
  );

  /**
   * Production layer — read-through cache over the live client. On cache hit,
   * decodes the stored JSON via Schema and returns; on miss, fetches live,
   * encodes via Schema, writes back, and returns. Cache write failures are
   * swallowed (the live value still flows out) so a transient sqlite hiccup
   * never blocks reads. Cache decode failures fall through to a live fetch —
   * a corrupt row self-heals on the next hit.
   */
  static cachedLayer = Layer.effect(
    EGWData,
    Effect.gen(function* () {
      const client = yield* EGWIpcClient;
      const cache = yield* CacheService;
      const live = makeLive(client);
      return {
        listBooks: (lang) =>
          cacheThrough({
            read: cache.getBooks(lang),
            write: (json) => cache.putBooks(lang, json),
            decode: decodeBooks,
            encode: encodeBooks,
            fetchLive: live.listBooks(lang),
          }),
        getToc: (bookId) =>
          cacheThrough({
            read: cache.getToc(bookId),
            write: (json) => cache.putToc(bookId, json),
            decode: decodeToc,
            encode: encodeToc,
            fetchLive: live.getToc(bookId),
          }),
        getChapter: (bookId, toc) => {
          const key = chapterCacheKey(toc);
          return cacheThrough({
            read: cache.getChapter(bookId, key),
            write: (json) => cache.putChapter(bookId, key, json),
            decode: decodeChapter,
            encode: encodeChapter,
            fetchLive: live.getChapter(bookId, toc),
          });
        },
        getDownloadState: (bookId) =>
          Effect.gen(function* () {
            const cachedToc = yield* cache.getToc(bookId);
            if (Option.isNone(cachedToc)) return Option.none();
            const decoded = yield* decodeToc(cachedToc.value).pipe(Effect.option);
            if (Option.isNone(decoded)) return Option.none();
            const cached = yield* cache.chapterCount(bookId);
            return Option.some({ cached, expected: countNavigable(decoded.value) });
          }),
        findContainingChapter: (bookId, paragraphPuborder) =>
          cacheThrough({
            read: cache.getToc(bookId),
            write: (json) => cache.putToc(bookId, json),
            decode: decodeToc,
            encode: encodeToc,
            fetchLive: live.getToc(bookId),
          }).pipe(Effect.map((toc) => findChapterForPuborder(toc, paragraphPuborder))),
        // getChapterByParaId composes: cached TOC fetch finds the TocItem,
        // then delegates back into the cached getChapter (so we get both
        // layers of cache hits for free).
        getChapterByParaId: (bookId, paraId) =>
          Effect.gen(function* () {
            const toc = yield* cacheThrough({
              read: cache.getToc(bookId),
              write: (json) => cache.putToc(bookId, json),
              decode: decodeToc,
              encode: encodeToc,
              fetchLive: live.getToc(bookId),
            });
            const item = toc.find((t) => Option.contains(t.para_id, paraId));
            if (item === undefined) {
              return yield* new EGWApiError({
                message: `No TOC item with para_id=${paraId} in book ${String(bookId)}`,
                cause: { bookId, paraId },
              });
            }
            const key = chapterCacheKey(item);
            return yield* cacheThrough({
              read: cache.getChapter(bookId, key),
              write: (json) => cache.putChapter(bookId, key, json),
              decode: decodeChapter,
              encode: encodeChapter,
              fetchLive: live.getChapter(bookId, item),
            });
          }),
        listFolders: (lang) =>
          cacheThrough({
            read: cache.getFolders(lang),
            write: (json) => cache.putFolders(lang, json),
            decode: decodeFolders,
            encode: encodeFolders,
            fetchLive: live.listFolders(lang),
          }),
        listBooksByFolder: (folderId, lang) =>
          cacheThrough({
            read: cache.getFolderBooks(folderId, lang),
            write: (json) => cache.putFolderBooks(folderId, lang, json),
            decode: decodeBooks,
            encode: encodeBooks,
            fetchLive: live.listBooksByFolder(folderId, lang),
          }),
      } satisfies EGWDataShape;
    }),
  );

  /** In-memory test layer. Pass overrides to stub individual methods. */
  static layerTest = (overrides: Partial<EGWDataShape> = {}) =>
    Layer.succeed(EGWData, {
      listBooks: () => Effect.succeed([]),
      getToc: () => Effect.succeed([]),
      getChapter: () => Effect.succeed([]),
      getChapterByParaId: () => Effect.succeed([]),
      getDownloadState: () => Effect.succeed(Option.none()),
      findContainingChapter: () => Effect.succeed(Option.none()),
      listFolders: () => Effect.succeed([]),
      listBooksByFolder: () => Effect.succeed([]),
      ...overrides,
    });
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

const makeLive = (client: EGWIpcClientShape): EGWDataShape => {
  const getToc = (bookId: number) => client.getBookToc(bookId);
  const getChapter = (bookId: number, toc: Schemas.TocItem) =>
    client.getChapterContent(bookId, chapterIdFromTocItem(toc));
  return {
    listBooks: (lang) =>
      Stream.runCollect(client.getBooks({ lang })).pipe(Effect.map((chunk) => Array.from(chunk))),
    getToc,
    getChapter,
    // Live layer has no cache to inspect — there's no meaningful "downloaded"
    // state without persistence. Return none so non-Electron callers (web
    // preview, tests) silently drop the badge instead of misreporting.
    getDownloadState: () => Effect.succeed(Option.none()),
    getChapterByParaId: (bookId, paraId) =>
      Effect.gen(function* () {
        const toc = yield* getToc(bookId);
        const item = toc.find((t) => Option.contains(t.para_id, paraId));
        if (item === undefined) {
          return yield* new EGWApiError({
            message: `No TOC item with para_id=${paraId} in book ${String(bookId)}`,
            cause: { bookId, paraId },
          });
        }
        return yield* getChapter(bookId, item);
      }),
    findContainingChapter: (bookId, paragraphPuborder) =>
      getToc(bookId).pipe(Effect.map((toc) => findChapterForPuborder(toc, paragraphPuborder))),
    listFolders: (lang) => client.getFolders(lang),
    listBooksByFolder: (folderId, lang) => client.getBooksByFolder(folderId, lang),
  };
};

// Read-through cache combinator. Cache read errors and decode errors both fall
// through to a live fetch (the cache is a perf optimization, not a source of
// truth). Cache write errors are swallowed — once we have the value, the user
// gets it regardless of whether persistence succeeded.
interface CacheThroughArgs<A> {
  readonly read: Effect.Effect<Option.Option<string>>;
  readonly write: (json: string) => Effect.Effect<void>;
  readonly decode: (input: unknown) => Effect.Effect<A, Schema.SchemaError>;
  readonly encode: (input: A) => Effect.Effect<string, Schema.SchemaError>;
  readonly fetchLive: Effect.Effect<A, EGWApiClientError>;
}

const cacheThrough = <A>(args: CacheThroughArgs<A>): Effect.Effect<A, EGWApiClientError> =>
  Effect.gen(function* () {
    const cached = yield* args.read;
    if (Option.isSome(cached)) {
      const decoded = yield* args.decode(cached.value).pipe(Effect.option);
      if (Option.isSome(decoded)) return decoded.value;
      // Decode failed — corrupt row. Fall through to live fetch; the write-back
      // below overwrites the bad row.
    }
    const fresh = yield* args.fetchLive;
    // Encode + write happen in the background-ish (still in this effect, but
    // failures are swallowed). If encoding fails, the value still returns —
    // some calls just won't be cached.
    yield* args.encode(fresh).pipe(
      Effect.flatMap(args.write),
      Effect.catchCause(() => Effect.void),
    );
    return fresh;
  });
