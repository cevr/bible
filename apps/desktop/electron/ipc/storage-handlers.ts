import { BrowserWindow } from 'electron';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  CacheDatabase,
  type BibleLastPositionRow,
  type CacheDatabaseService,
  type LastPositionRow,
} from '../cache-db.js';
import { indexChapter } from '../indexer.js';
import { handleIpc } from './handle.js';
import type { MainRuntimeAccess } from './runtime-access.js';

/** Register settings, cache, and last-position persistence handlers. */
export const registerStorageIpc = (options: {
  readonly getRuntime: MainRuntimeAccess;
  readonly settingsFile: () => string;
}): void => {
  // Run a CacheDatabase op against the late-bound main runtime. Returns the
  // fallback when the runtime is not up yet, keeping every handler safe while
  // Electron is starting or shutting down.
  const runCache = <A>(
    op: (cache: CacheDatabaseService) => Effect.Effect<A, SqlError>,
    fallback: A,
  ): Promise<A> => {
    const runtime = options.getRuntime();
    if (runtime === null) return Promise.resolve(fallback);
    return runtime.runPromise(CacheDatabase.pipe(Effect.flatMap(op)));
  };

  // Node's fs errors are Error subclasses with an extra `code` string field.
  // Probe through `in` so the access remains free of narrowing casts.
  const errnoCode = (error: unknown): string | undefined => {
    if (!(error instanceof Error) || !('code' in error)) return undefined;
    const code = error.code;
    return typeof code === 'string' ? code : undefined;
  };

  const readJsonFile = async (file: string): Promise<string | null> => {
    try {
      return await fs.readFile(file, 'utf-8');
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') return null;
      throw error;
    }
  };

  const writeJsonFile = async (file: string, text: string): Promise<void> => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Write to a sibling tmp file then rename, so a crash mid-write cannot
    // leave a half-flushed settings file that fails to parse on next launch.
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, text, 'utf-8');
    await fs.rename(tmp, file);
  };

  handleIpc('settings:read', () => readJsonFile(options.settingsFile()));
  handleIpc('settings:write', (_event, text) => writeJsonFile(options.settingsFile(), text));

  // Cache values are opaque JSON strings. Schema parsing remains in the
  // renderer, while this module owns persistence and indexing coordination.
  handleIpc(
    'cache:getBooks',
    (_event, lang): Promise<string | null> => runCache((cache) => cache.getBooks(lang), null),
  );
  handleIpc(
    'cache:putBooks',
    (_event, lang, json): Promise<void> =>
      runCache((cache) => cache.putBooks(lang, json), undefined),
  );
  handleIpc(
    'cache:getToc',
    (_event, bookId): Promise<string | null> => runCache((cache) => cache.getToc(bookId), null),
  );
  handleIpc(
    'cache:putToc',
    (_event, bookId, json): Promise<void> =>
      runCache((cache) => cache.putToc(bookId, json), undefined),
  );
  handleIpc(
    'cache:getChapter',
    (_event, bookId, paraId): Promise<string | null> =>
      runCache((cache) => cache.getChapter(bookId, paraId), null),
  );
  handleIpc('cache:putChapter', async (_event, bookId, paraId, json): Promise<void> => {
    await runCache((cache) => cache.putChapter(bookId, paraId, json), undefined);
    // Mirror the chapter into the EGW paragraph index without making cache
    // writes wait for indexing. Broadcast touched Bible chapters so every
    // renderer can invalidate its commentary markers.
    const runtime = options.getRuntime();
    if (runtime !== null) {
      void indexChapter(runtime, bookId, json, (touched) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('bible:egwCommentaryUpdated', touched);
        }
      });
    }
  });
  handleIpc(
    'cache:getFolders',
    (_event, lang): Promise<string | null> => runCache((cache) => cache.getFolders(lang), null),
  );
  handleIpc(
    'cache:putFolders',
    (_event, lang, json): Promise<void> =>
      runCache((cache) => cache.putFolders(lang, json), undefined),
  );
  handleIpc(
    'cache:getFolderBooks',
    (_event, folderId, lang): Promise<string | null> =>
      runCache((cache) => cache.getFolderBooks(folderId, lang), null),
  );
  handleIpc(
    'cache:putFolderBooks',
    (_event, folderId, lang, json): Promise<void> =>
      runCache((cache) => cache.putFolderBooks(folderId, lang, json), undefined),
  );
  handleIpc(
    'cache:chapterCount',
    (_event, bookId): Promise<number> => runCache((cache) => cache.chapterCount(bookId), 0),
  );

  handleIpc(
    'lastPosition:read',
    (): Promise<LastPositionRow | null> => runCache((cache) => cache.readLastPosition(), null),
  );
  handleIpc(
    'lastPosition:write',
    (_event, bookId, paraId, paragraphId = null): Promise<void> =>
      runCache((cache) => cache.writeLastPosition(bookId, paraId, paragraphId), undefined),
  );
  handleIpc(
    'lastPosition:clear',
    (): Promise<void> => runCache((cache) => cache.clearLastPosition(), undefined),
  );

  handleIpc(
    'bibleLastPosition:read',
    (): Promise<BibleLastPositionRow | null> =>
      runCache((cache) => cache.readBibleLastPosition(), null),
  );
  handleIpc(
    'bibleLastPosition:write',
    (_event, book, chapter, verse = null): Promise<void> =>
      runCache((cache) => cache.writeBibleLastPosition(book, chapter, verse), undefined),
  );
  handleIpc(
    'bibleLastPosition:clear',
    (): Promise<void> => runCache((cache) => cache.clearBibleLastPosition(), undefined),
  );
};
