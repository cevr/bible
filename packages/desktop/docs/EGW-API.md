# @bible/core/egw — Surface Map

One-page reference for the renderer's data layer. Source: `packages/core/src/egw/`.

## Imports

```ts
import { EGWApiClient, EGWAuth, EGWApiError, EGWAuthError, Schemas } from '@bible/core/egw';
```

## Layers

Both services are `Context.Service` (Effect v4). To use the live client in the renderer:

```ts
const ApiLayer = EGWApiClient.Live.pipe(
  Layer.provide(EGWAuth.Live),
  Layer.provide(FetchHttpClient.layer), // browser fetch — no platform-bun/node needed
  Layer.provide(BrowserFileSystem.layer), // EGWAuth.Live needs FileSystem + Path for token cache
  Layer.provide(BrowserPath.layer),
);
```

| Layer                                     | Requires                             | Provides              |
| ----------------------------------------- | ------------------------------------ | --------------------- |
| `EGWApiClient.Live`                       | `EGWAuth` + `HttpClient`             | `EGWApiClient`        |
| `EGWApiClient.Test({books?, languages?})` | —                                    | `EGWApiClient` (mock) |
| `EGWAuth.Live`                            | `FileSystem` + `Path` + `HttpClient` | `EGWAuth`             |
| `EGWAuth.Test(token?)`                    | —                                    | `EGWAuth` (mock)      |

**Service keys:** `@bible/core/egw/client/EGWApiClient`, `@bible/core/egw/auth/EGWAuth`.

## Config (env vars, all have defaults)

| Var                 | Default                                               | Notes                                                         |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| `EGW_API_BASE_URL`  | `https://a.egwwritings.org`                           | Content API                                                   |
| `EGW_AUTH_BASE_URL` | `https://cpanel.egwwritings.org`                      | OAuth                                                         |
| `EGW_CLIENT_ID`     | `""`                                                  | **Required** at runtime — bake via Bun `define` at build time |
| `EGW_CLIENT_SECRET` | `""`                                                  | **Required** — Redacted, same baking strategy                 |
| `EGW_SCOPE`         | `writings search studycenter subscriptions user_info` | OAuth scope                                                   |
| `EGW_TOKEN_FILE`    | `data/tokens.json`                                    | Path the live `EGWAuth` writes its cached token to            |
| `EGW_USER_AGENT`    | `EGW-Effect-Client/1.0`                               | Outgoing UA header                                            |

In Electron renderer: route `EGW_TOKEN_FILE` to a path inside `app.getPath('userData')` via env injection at build, OR replace `EGWAuth.Live` with a renderer-side implementation that stores the cached token through the existing settings IPC bridge. Either is fine; the latter is one fewer FS dep in the renderer bundle.

## EGWApiClient methods

All return `Effect<A, EGWApiError | HttpClientError | SchemaError>` unless noted. Built-in exponential-backoff retry (3 attempts, 100/200/400 ms).

| Method                                          | Returns                | Notes                                                                                                                                       |
| ----------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `getLanguages()`                                | `readonly Language[]`  | Flat list — `{code, name, direction}`                                                                                                       |
| `getFoldersByLanguage(code)`                    | `readonly Folder[]`    | Recursive `children?` tree. Non-leaf folders may have 0 books — use `getBooks({lang})` for a flat list instead.                             |
| `getBooksByFolder(folderId, params?)`           | `readonly Book[]`      | Single page; supports `limit`/`offset`/`page`                                                                                               |
| `getBooks(params?)`                             | **`Stream<Book>`**     | Auto-paginates all pages. NOT an Effect — must consume via `Stream.runCollect`/`Stream.runForEach`. If `params.page` set, single page only. |
| `getBook(id, {trans?})`                         | `Book`                 | Single book metadata                                                                                                                        |
| `getBookToc(id)`                                | `readonly TocItem[]`   | Flat TOC with `level` for nesting. `para_id` is the chapter's anchor paragraph.                                                             |
| `getChapterContent(bookId, chapterId, params?)` | `readonly Paragraph[]` | **`chapterId` is the integer AFTER the dot in `para_id`** (e.g., `para_id="84.155"` → pass `"155"`). See "Chapter ID extraction" below.     |
| `downloadBook(id)`                              | `ArrayBuffer`          | Full book download (likely zipped/EPUB)                                                                                                     |
| `search(params)`                                | `SearchResponse`       | Server-side search. Paginated via `next`/`previous` URLs.                                                                                   |
| `getSuggestions(query, limit=10)`               | `readonly string[]`    | Autocomplete                                                                                                                                |
| `getBookCoverUrl(id, size?)`                    | `string`               | Pure URL builder; no HTTP call                                                                                                              |
| `getMirrors()`                                  | `readonly string[]`    | CDN mirror URLs                                                                                                                             |

## Chapter ID extraction (the gotcha)

The chapter endpoint expects only the integer after the dot in a `para_id`. From `core/src/sync/egw-sync.ts:148-163`:

```ts
const chapterIdFromTocItem = (toc: Schemas.TocItem): string => {
  if (toc.para_id !== undefined && toc.para_id !== null) {
    const match = toc.para_id.match(/\.(\d+)$/);
    return match?.[1] ?? String(toc.puborder);
  }
  return String(toc.puborder);
};
```

Always derive `chapterId` this way. Passing the full `para_id` returns wrong data without erroring.

## Schemas (consume via `Schemas.X`)

| Schema                 | Shape (key fields)                                                                                             | Used for                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `Language`             | `code, name, direction: "ltr" \| "rtl"`                                                                        | Language picker                                                    |
| `Folder`               | `folder_id, name, nbooks, children?` recursive                                                                 | Library browse tree                                                |
| `Book`                 | `book_id, code, title, author, lang, type, npages, nelements, cover, files, permission_required`               | Book card + reader header                                          |
| `TocItem`              | `para_id, level, title, refcode_short, puborder`                                                               | TOC sidebar; chapterId source                                      |
| `Paragraph`            | `para_id, id_prev, id_next, refcode_*, element_type ("h3"\|"p"\|…), element_subtype, content (HTML), puborder` | The atom — fed into `parseParagraphContent`                        |
| `SearchHit`            | `lang, pub_code, pub_name, para_id, refcode_short, refcode_long, snippet, weight`                              | Search result row                                                  |
| `SearchResponse`       | `next, previous, total, count, results: SearchHit[]`                                                           | Paginated search                                                   |
| `BooksQueryParams`     | `lang?, type?, folder?, search?, page?, limit?, offset?, ...`                                                  | `getBooks` filter                                                  |
| `ChapterContentParams` | `highlight?, trans?`                                                                                           | No `limit`/`offset` — chapter pagination is by following `id_next` |

Most string fields on `Paragraph` and `TocItem` are nullable/optional — handle with `Option.fromNullishOr` at the renderer boundary.

## Reference parsing (`parseEGWRef`)

Pure utilities for `"PP 351.1"`-style refcodes — no HTTP. Used downstream of scripture/book refs to construct clickable navigation targets.

| Export                                                                                | Returns                                  |
| ------------------------------------------------------------------------------------- | ---------------------------------------- |
| `parseEGWRef(s)`                                                                      | `Option<EGWParsedRef \| EGWSearchQuery>` |
| `parseEGWRefEffect(s)`                                                                | `Effect<EGWParsedRef, EGWParseError>`    |
| `formatEGWRef(parsed)`                                                                | `string`                                 |
| `getBookCode(s)` / `buildRefcodePattern(...)` / `isReference(s)` / `isSearchQuery(s)` | Predicates/helpers                       |

`EGWParsedRef` is a tagged union: `paragraph` \| `paragraph-range` \| `page` \| `page-range` \| `book`.

## Renderer wiring sketch (for #22)

```ts
// renderer/services/EGWData.ts
class EGWData extends Context.Service<
  EGWData,
  {
    readonly listBooks: (lang: string) => Effect.Effect<readonly Book[], EGWApiClientError>;
    readonly getToc: (bookId: number) => Effect.Effect<readonly TocItem[], EGWApiClientError>;
    readonly getChapter: (
      bookId: number,
      toc: TocItem,
    ) => Effect.Effect<readonly Paragraph[], EGWApiClientError>;
  }
>()('desktop/services/EGWData') {
  static layer = Layer.effect(
    EGWData,
    Effect.gen(function* () {
      const client = yield* EGWApiClient;
      return {
        listBooks: (lang) => Stream.runCollect(client.getBooks({ lang })),
        getToc: (id) => client.getBookToc(id),
        getChapter: (bookId, toc) => client.getChapterContent(bookId, chapterIdFromTocItem(toc)),
      };
    }),
  );
}
```

The CacheService (#19) slots in by wrapping these three methods: try local SQLite first, fall through to `client.*`, persist the result. No call sites change.

## Notes for prefetch orchestrator (#24)

- `getChapterContent` is the hot path — typical book has dozens to hundreds of chapters.
- `Effect.forEach(toc, getChapter, { concurrency: 4 })` is the obvious shape. EGW retries internally so transient failures self-heal.
- Per-book download via `downloadBook()` may be a faster alternative once the cache schema lands — single round-trip, but returns a blob the renderer would need to extract.
