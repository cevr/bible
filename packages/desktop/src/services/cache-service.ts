import { Context, Effect, Layer, Option } from 'effect';

// Renderer-side seam over the SQLite cache that lives in the Electron main
// process. Each method round-trips through the preload `window.api.cache`
// bridge; main owns the schema, this side is just JSON in/out.
//
// Why JSON strings rather than typed shapes here: the cache is a write-through
// of whatever the EGW API returned. The same Schema decoders that parse a
// live HTTP response also parse a cache hit, so callers that wrap EGWData get
// one parse path for both. Keeping main schema-blind also means schema changes
// in @bible/core/egw don't require a preload rebuild.
//
// CacheService is the seam EGWData (#22) will wrap to become "try cache,
// fall back to live, then write-back". That wrapping lives in runtime.ts, not
// in EGWData itself, so the in-memory test layer for EGWData stays unaffected.

export interface CacheServiceShape {
  readonly getBooks: (lang: string) => Effect.Effect<Option.Option<string>>;
  readonly putBooks: (lang: string, json: string) => Effect.Effect<void>;
  readonly getToc: (bookId: number) => Effect.Effect<Option.Option<string>>;
  readonly putToc: (bookId: number, json: string) => Effect.Effect<void>;
  readonly getChapter: (bookId: number, paraId: string) => Effect.Effect<Option.Option<string>>;
  readonly putChapter: (bookId: number, paraId: string, json: string) => Effect.Effect<void>;
  /**
   * Row count of cached chapters for a book. Used by LibraryRail to render a
   * "downloaded ✓" badge when this matches the navigable-chapter count of the
   * book's TOC. Cheap — just a `COUNT(*) WHERE book_id = ?` over an indexed PK.
   */
  readonly chapterCount: (bookId: number) => Effect.Effect<number>;
  readonly getFolders: (lang: string) => Effect.Effect<Option.Option<string>>;
  readonly putFolders: (lang: string, json: string) => Effect.Effect<void>;
  readonly getFolderBooks: (folderId: number, lang: string) => Effect.Effect<Option.Option<string>>;
  readonly putFolderBooks: (folderId: number, lang: string, json: string) => Effect.Effect<void>;
}

export class CacheService extends Context.Service<CacheService, CacheServiceShape>()(
  '@bible/desktop/services/CacheService',
) {
  static layer = Layer.succeed(CacheService, {
    getBooks: (lang) =>
      Effect.promise(() => window.api.cache.getBooks(lang)).pipe(Effect.map(Option.fromNullishOr)),
    putBooks: (lang, json) => Effect.promise(() => window.api.cache.putBooks(lang, json)),
    getToc: (bookId) =>
      Effect.promise(() => window.api.cache.getToc(bookId)).pipe(Effect.map(Option.fromNullishOr)),
    putToc: (bookId, json) => Effect.promise(() => window.api.cache.putToc(bookId, json)),
    getChapter: (bookId, paraId) =>
      Effect.promise(() => window.api.cache.getChapter(bookId, paraId)).pipe(
        Effect.map(Option.fromNullishOr),
      ),
    putChapter: (bookId, paraId, json) =>
      Effect.promise(() => window.api.cache.putChapter(bookId, paraId, json)),
    chapterCount: (bookId) => Effect.promise(() => window.api.cache.chapterCount(bookId)),
    getFolders: (lang) =>
      Effect.promise(() => window.api.cache.getFolders(lang)).pipe(
        Effect.map(Option.fromNullishOr),
      ),
    putFolders: (lang, json) => Effect.promise(() => window.api.cache.putFolders(lang, json)),
    getFolderBooks: (folderId, lang) =>
      Effect.promise(() => window.api.cache.getFolderBooks(folderId, lang)).pipe(
        Effect.map(Option.fromNullishOr),
      ),
    putFolderBooks: (folderId, lang, json) =>
      Effect.promise(() => window.api.cache.putFolderBooks(folderId, lang, json)),
  });

  /**
   * In-memory test layer. Backed by Maps so tests can introspect what was
   * cached without extending the public shape. Composite keys for chapters
   * are joined with `\x00` because the EGW para_id format ("84.155") doesn't
   * use null bytes — collision-free without complicating callers.
   */
  static layerTest = (refs?: {
    readonly books: Map<string, string>;
    readonly tocs: Map<number, string>;
    readonly chapters: Map<string, string>;
    readonly folders?: Map<string, string>;
    readonly folderBooks?: Map<string, string>;
  }) => {
    const books = refs?.books ?? new Map<string, string>();
    const tocs = refs?.tocs ?? new Map<number, string>();
    const chapters = refs?.chapters ?? new Map<string, string>();
    const folders = refs?.folders ?? new Map<string, string>();
    const folderBooks = refs?.folderBooks ?? new Map<string, string>();
    const chapterKey = (bookId: number, paraId: string) => `${String(bookId)}\x00${paraId}`;
    const folderBooksKey = (folderId: number, lang: string) => `${String(folderId)}\x00${lang}`;
    return Layer.succeed(CacheService, {
      getBooks: (lang) => Effect.sync(() => Option.fromNullishOr(books.get(lang))),
      putBooks: (lang, json) =>
        Effect.sync(() => {
          books.set(lang, json);
        }),
      getToc: (bookId) => Effect.sync(() => Option.fromNullishOr(tocs.get(bookId))),
      putToc: (bookId, json) =>
        Effect.sync(() => {
          tocs.set(bookId, json);
        }),
      getChapter: (bookId, paraId) =>
        Effect.sync(() => Option.fromNullishOr(chapters.get(chapterKey(bookId, paraId)))),
      putChapter: (bookId, paraId, json) =>
        Effect.sync(() => {
          chapters.set(chapterKey(bookId, paraId), json);
        }),
      chapterCount: (bookId) =>
        Effect.sync(() => {
          const prefix = `${String(bookId)}\x00`;
          let count = 0;
          for (const k of chapters.keys()) {
            if (k.startsWith(prefix)) count += 1;
          }
          return count;
        }),
      getFolders: (lang) => Effect.sync(() => Option.fromNullishOr(folders.get(lang))),
      putFolders: (lang, json) =>
        Effect.sync(() => {
          folders.set(lang, json);
        }),
      getFolderBooks: (folderId, lang) =>
        Effect.sync(() => Option.fromNullishOr(folderBooks.get(folderBooksKey(folderId, lang)))),
      putFolderBooks: (folderId, lang, json) =>
        Effect.sync(() => {
          folderBooks.set(folderBooksKey(folderId, lang), json);
        }),
    } satisfies CacheServiceShape);
  };

  /** No-op layer for contexts that should never hit the cache. */
  static layerNoop = Layer.succeed(CacheService, {
    getBooks: () => Effect.succeed(Option.none()),
    putBooks: () => Effect.void,
    getToc: () => Effect.succeed(Option.none()),
    putToc: () => Effect.void,
    getChapter: () => Effect.succeed(Option.none()),
    putChapter: () => Effect.void,
    chapterCount: () => Effect.succeed(0),
    getFolders: () => Effect.succeed(Option.none()),
    putFolders: () => Effect.void,
    getFolderBooks: () => Effect.succeed(Option.none()),
    putFolderBooks: () => Effect.void,
  });
}
