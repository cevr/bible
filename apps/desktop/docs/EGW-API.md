# @bible/core/egw — Surface Map

One-page reference for the desktop EGW data path. Source:
`packages/core/src/egw/`, composed by `electron/runtime.ts` and adapted for the
renderer by `src/services/egw-ipc-client.ts`.

## Imports

```ts
import { EGWApiClient, EGWAuth, EGWApiError, EGWAuthError, Schemas } from '@bible/core/egw';
```

## Layers

Both services are `Context.Service` (Effect v4). The live client runs only in
Electron main; OAuth credentials and tokens never enter the renderer:

```ts
const AuthLayer = EGWAuth.Live.pipe(
  Layer.provide(EGWTokenStore.layerFromJsonPort({ readJson, writeJson })),
  Layer.provide(FetchHttpClient.layer),
);

const ApiLayer = EGWApiClient.Live.pipe(
  Layer.provide(AuthLayer),
  Layer.provide(FetchHttpClient.layer),
);
```

| Layer                                     | Requires                 | Provides              |
| ----------------------------------------- | ------------------------ | --------------------- |
| `EGWApiClient.Live`                       | `EGWAuth` + `HttpClient` | `EGWApiClient`        |
| `EGWApiClient.Test({books?, languages?})` | —                        | `EGWApiClient` (mock) |
| `EGWAuth.Live`                            | `EGWTokenStore` + HTTP   | `EGWAuth`             |
| `EGWAuth.Test(token?)`                    | —                        | `EGWAuth` (mock)      |

The renderer uses the narrower `EGWIpcClient` adapter. Its methods invoke the
typed preload bridge and decode the returned JSON with the same core schemas
used by the cache. `EGWData.cachedLayer` composes that adapter with
`CacheService`, so components do not know whether a value came from SQLite or
the network.

## Config (env vars, all have defaults)

| Var                 | Default                                               | Notes                                                         |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| `EGW_API_BASE_URL`  | `https://a.egwwritings.org`                           | Content API                                                   |
| `EGW_AUTH_BASE_URL` | `https://cpanel.egwwritings.org`                      | OAuth                                                         |
| `EGW_CLIENT_ID`     | `""`                                                  | **Required** at runtime — bake via Bun `define` at build time |
| `EGW_CLIENT_SECRET` | `""`                                                  | **Required** — Redacted, same baking strategy                 |
| `EGW_SCOPE`         | `writings search studycenter subscriptions user_info` | OAuth scope                                                   |
| `EGW_TOKEN_FILE`    | `data/tokens.json`                                    | Used by the optional filesystem token-store layer             |
| `EGW_USER_AGENT`    | `EGW-Effect-Client/1.0`                               | Outgoing UA header                                            |

Electron main resolves the token file beneath `app.getPath('userData')` and
provides a Node-file `EGWTokenStore` adapter. `EGW_CLIENT_ID` and
`EGW_CLIENT_SECRET` are read in main before the managed runtime is constructed.
They are not baked into the renderer bundle.

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

The chapter endpoint expects only the integer after the dot in a `para_id`. The canonical coercion lives in `packages/core/src/egw/parse.ts`:

```ts
export function chapterIdFromTocItem(toc: Schemas.TocItem): string {
  if (Option.isSome(toc.para_id)) {
    const match = toc.para_id.value.match(/\.(\d+)$/);
    return match?.[1] ?? String(toc.puborder);
  }
  return String(toc.puborder);
}
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

## Current desktop wiring

```ts
// renderer runtime
const EGWDataLayer = EGWData.cachedLayer.pipe(
  Layer.provide(EGWIpcClient.layer),
  Layer.provide(CacheService.layer),
);
```

The transport boundary has two intentionally different interfaces:

1. `IpcInvokeContract` describes serializable channel arguments/results shared
   by main and preload.
2. `EGWIpcClientShape` restores domain errors, streams, and decoded schemas for
   the renderer.

That adapter is the depth: transport details and JSON decoding can change
without widening the interface consumed by `EGWData`.

## Notes for prefetch orchestrator (#24)

- `getChapterContent` is the hot path — typical book has dozens to hundreds of chapters.
- `Effect.forEach(toc, getChapter, { concurrency: 4 })` is the obvious shape. EGW retries internally so transient failures self-heal.
- Per-book download via `downloadBook()` may be a faster alternative once the cache schema lands — single round-trip, but returns a blob the renderer would need to extract.
