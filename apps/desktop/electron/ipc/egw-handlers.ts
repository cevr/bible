import { EGWApiClient, nodesToText, Schemas } from '@bible/core/egw';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { Effect, Option, Schema, Stream } from 'effect';

import type { SearchHitPayload } from '../ipc-contract.js';
import { handleIpc } from './handle.js';
import type { MainRuntimeAccess } from './runtime-access.js';

class EgwIpcError extends Schema.TaggedErrorClass<EgwIpcError>()('EgwIpcError', {
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

const BooksJsonSchema = Schema.fromJsonString(Schema.Array(Schemas.Book));
const TocJsonSchema = Schema.fromJsonString(Schema.Array(Schemas.TocItem));
const ChapterJsonSchema = Schema.fromJsonString(Schema.Array(Schemas.Paragraph));
const SearchJsonSchema = Schema.fromJsonString(Schemas.SearchResponse);
const FoldersJsonSchema = Schema.fromJsonString(Schema.Array(Schemas.Folder));
const encodeBooksJson = Schema.encodeEffect(BooksJsonSchema);
const encodeTocJson = Schema.encodeEffect(TocJsonSchema);
const encodeChapterJson = Schema.encodeEffect(ChapterJsonSchema);
const encodeSearchJson = Schema.encodeEffect(SearchJsonSchema);
const encodeFoldersJson = Schema.encodeEffect(FoldersJsonSchema);

export const registerEgwIpc = (getRuntime: MainRuntimeAccess): void => {
  const runEgw = <A>(
    effect: Effect.Effect<A, unknown, EGWApiClient | EGWParagraphDatabase>,
  ): Promise<A> => {
    const runtime = getRuntime();
    if (runtime === null) {
      console.error('[runEgw] mainRuntime is null when IPC call arrived');
      return Promise.reject(new EgwIpcError({ message: 'EGW runtime not ready', cause: null }));
    }
    return runtime.runPromise(
      effect.pipe(
        Effect.catchCause((cause) =>
          Effect.fail(
            new EgwIpcError({
              message: `EGW request failed: ${String(cause)}`,
              cause,
            }),
          ),
        ),
      ),
    );
  };

  handleIpc(
    'search:fts',
    async (_event, query, limit, bookCode): Promise<readonly SearchHitPayload[]> => {
      const runtime = getRuntime();
      if (runtime === null) return [];
      const rows = await runtime.runPromise(
        EGWParagraphDatabase.pipe(
          Effect.flatMap((db) => db.searchParagraphs(query, limit, bookCode)),
        ),
      );
      return rows.map((r) => ({
        bookId: r.bookId,
        bookCode: r.bookCode,
        bookTitle: r.bookTitle,
        paraId: Option.getOrNull(r.para_id),
        refcodeShort: Option.getOrNull(r.refcode_short),
        snippet: nodesToText(r.nodes),
        puborder: r.puborder,
      }));
    },
  );

  handleIpc(
    'search:refcode',
    async (_event, refcode, limit): Promise<readonly SearchHitPayload[]> => {
      const runtime = getRuntime();
      if (runtime === null) return [];
      const rows = await runtime.runPromise(
        EGWParagraphDatabase.pipe(Effect.flatMap((db) => db.findByRefcodeShort(refcode, limit))),
      );
      return rows.map((r) => ({
        bookId: r.bookId,
        bookCode: r.bookCode,
        bookTitle: r.bookTitle,
        paraId: Option.getOrNull(r.para_id),
        refcodeShort: Option.getOrNull(r.refcode_short),
        snippet: nodesToText(r.nodes),
        puborder: r.puborder,
      }));
    },
  );

  handleIpc(
    'egw:fetchBooks',
    async (_event, lang): Promise<string> =>
      runEgw(
        EGWApiClient.pipe(
          Effect.flatMap((client) =>
            Stream.runCollect(client.getBooks({ lang })).pipe(
              Effect.map((chunk) => Array.from(chunk)),
              Effect.flatMap(encodeBooksJson),
            ),
          ),
        ),
      ),
  );

  handleIpc(
    'egw:fetchToc',
    async (_event, bookId): Promise<string> =>
      runEgw(
        EGWApiClient.pipe(
          Effect.flatMap((client) =>
            client.getBookToc(bookId).pipe(
              Effect.map((items) => items.slice()),
              Effect.flatMap(encodeTocJson),
            ),
          ),
        ),
      ),
  );

  handleIpc(
    'egw:fetchChapter',
    async (_event, bookId, chapterId): Promise<string> =>
      runEgw(
        EGWApiClient.pipe(
          Effect.flatMap((client) =>
            client.getChapterContent(bookId, chapterId).pipe(
              Effect.map((paragraphs) => paragraphs.slice()),
              Effect.flatMap(encodeChapterJson),
            ),
          ),
        ),
      ),
  );

  handleIpc(
    'egw:search',
    async (_event, query, limit): Promise<string> =>
      runEgw(
        EGWApiClient.pipe(
          Effect.flatMap((client) =>
            client.search({ query, limit }).pipe(Effect.flatMap(encodeSearchJson)),
          ),
        ),
      ),
  );

  handleIpc(
    'egw:fetchFolders',
    async (_event, lang): Promise<string> =>
      runEgw(
        EGWApiClient.pipe(
          Effect.flatMap((client) =>
            client.getFoldersByLanguage(lang).pipe(
              Effect.map((folders) => folders.slice()),
              Effect.flatMap(encodeFoldersJson),
            ),
          ),
        ),
      ),
  );

  handleIpc(
    'egw:fetchBooksByFolder',
    async (_event, folderId, lang): Promise<string> =>
      runEgw(
        EGWApiClient.pipe(
          Effect.flatMap((client) =>
            client.getBooksByFolder(folderId, { trans: lang }).pipe(
              Effect.map((books) => books.slice()),
              Effect.flatMap(encodeBooksJson),
            ),
          ),
        ),
      ),
  );
};
