import {
  BibleCorpus,
  BibleDatabase,
  type BibleCorpusService,
  type CrossReferenceAsset,
  type KjvAssetFile,
  type MarginNotesAsset,
  type StrongsLexiconAsset,
  type StrongsVerseAsset,
} from '@bible/core/bible-db';
import { getBibleBook } from '@bible/core/bible';
import { EGWApiClient, extractScriptureRefs, nodesToText, Schemas } from '@bible/core/egw';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { Effect, Option, Schema, Stream } from 'effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';

class EgwIpcError extends Schema.TaggedErrorClass<EgwIpcError>()('EgwIpcError', {
  message: Schema.String,
  cause: Schema.Unknown,
}) {}
import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CacheDatabase,
  type BibleLastPositionRow,
  type CacheDatabaseService,
  type LastPositionRow,
} from './cache-db.js';
import { backfillIndex, indexChapter } from './indexer.js';
import type {
  ChapterMarginNotesPayload,
  ConcordanceHitPayload,
  CrossRefPayload,
  EgwCommentaryHitPayload,
  IpcInvokeArgs,
  IpcInvokeChannel,
  IpcInvokeResult,
  KjvChapterPayload,
  KjvStrongsChapterPayload,
  MarginNotePayload,
  SearchHitPayload,
  StrongsLexiconPayload,
} from './ipc-contract.js';
import { makeRuntime, type MainRuntime } from './runtime.js';

const handleIpc = <Channel extends IpcInvokeChannel>(
  channel: Channel,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: IpcInvokeArgs<Channel>
  ) => IpcInvokeResult<Channel> | Promise<IpcInvokeResult<Channel>>,
): void => {
  ipcMain.handle(channel, handler);
};

// Tiny .env loader. Vite handles env injection for the renderer; the main
// process used to read nothing because EGW HTTP lived in the browser. Now
// that auth + API runs here, we need EGW_CLIENT_ID/SECRET in process.env
// before makeRuntime constructs EGWAuth.Live. Skipped silently if the file
// is absent — packaged builds should provide credentials via the OS env.
const loadDotEnv = (file: string): void => {
  let text: string;
  try {
    text = readFileSync(file, 'utf-8');
  } catch {
    return;
  }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    // eslint-disable-next-line node/no-process-env -- bootstrap, pre-Effect
    if (process.env[key] === undefined) process.env[key] = value;
  }
};

// Electron main runs as a plain Node script — it has no access to Effect Config
// and the canonical way to detect dev mode is the NODE_ENV the dev script sets.
// eslint-disable-next-line node/no-process-env -- main process bootstrap, no Effect runtime here
const isDev = process.env['NODE_ENV'] === 'development';
const VITE_DEV_URL = 'http://localhost:1420';

const SETTINGS_FILENAME = 'settings.json';
const EGW_TOKEN_FILENAME = 'egw-tokens.json';
const CACHE_FILENAME = 'cache.sqlite';
const BIBLE_FILENAME = 'bible.sqlite';

const settingsPath = () => path.join(app.getPath('userData'), SETTINGS_FILENAME);
const cacheDbPath = () => path.join(app.getPath('userData'), CACHE_FILENAME);
const bibleDbPath = () => path.join(app.getPath('userData'), BIBLE_FILENAME);
const egwTokenPath = () => path.join(app.getPath('userData'), EGW_TOKEN_FILENAME);

// Effect runtime hosting EGW/cache data and the canonical Bible database.
// Each SQLite file has exactly one @effect/sql-sqlite-node connection; Bible
// data is isolated in bible.sqlite because it has a distinct lifecycle from
// the replaceable API cache. Started after app.whenReady() so userData is
// resolvable; disposed on will-quit. The cache tables (book_lists, tocs,
// chapters, folders, folder_books, last_position, bible_last_position) used to
// be driven by a second `better-sqlite3` handle here — that collided with this
// connection (SQLITE_BUSY, lost PRAGMA writes). CacheDatabase now owns them on
// the same connection. See electron/cache-db.ts.
let mainRuntime: MainRuntime | null = null;

// Run a CacheDatabase op against the main runtime. Returns the fallback when
// the runtime isn't up yet (shouldn't happen post-whenReady — every cache IPC
// handler is registered before the window loads — but keeps handlers safe).
const runCache = <A>(
  op: (cache: CacheDatabaseService) => Effect.Effect<A, SqlError>,
  fallback: A,
): Promise<A> => {
  if (mainRuntime === null) return Promise.resolve(fallback);
  return mainRuntime.runPromise(CacheDatabase.pipe(Effect.flatMap(op)));
};

// Node's fs errors are Error subclasses with an extra `code` string field.
// Probe for it via `in` to keep the access free of narrowing casts; oxlint
// rejects `as NodeJS.ErrnoException` and TS rejects the bare property access.
const errnoCode = (err: unknown): string | undefined => {
  if (!(err instanceof Error) || !('code' in err)) return undefined;
  const code = err.code;
  return typeof code === 'string' ? code : undefined;
};

const readJsonFile = async (file: string): Promise<string | null> => {
  try {
    return await fs.readFile(file, 'utf-8');
  } catch (err) {
    if (errnoCode(err) === 'ENOENT') return null;
    throw err;
  }
};

const writeJsonFile = async (file: string, text: string): Promise<void> => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Write to a sibling tmp file then rename, so a crash mid-write can't leave
  // a half-flushed file that fails to parse on next launch.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, text, 'utf-8');
  await fs.rename(tmp, file);
};

// Resolved at window construction. In dev the assets folder sits next to
// `electron/` (we run `electron .` against the project root); in packaged
// builds electron-builder mirrors `assets/` under the app resources, reachable
// via `process.resourcesPath`. Either lookup falls through to undefined →
// BrowserWindow uses the default Electron icon.
const resolveWindowIcon = (): string | undefined => {
  const candidates = [
    path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    path.join(process.resourcesPath, 'assets', 'icon.png'),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p);
      return p;
    } catch {
      // try next
    }
  }
  return undefined;
};

const createWindow = async (): Promise<void> => {
  const icon = resolveWindowIcon();
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    ...(icon !== undefined ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    await win.loadURL(VITE_DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }
};

handleIpc('settings:read', () => readJsonFile(settingsPath()));
handleIpc('settings:write', (_event, text) => writeJsonFile(settingsPath(), text));

// Cache IPC — get returns null on miss, put is upsert. The renderer is
// responsible for Schema parsing on the way out and Schema encoding on the
// way in, so main only ever sees opaque JSON strings.
handleIpc(
  'cache:getBooks',
  (_event, lang): Promise<string | null> => runCache((c) => c.getBooks(lang), null),
);
handleIpc(
  'cache:putBooks',
  (_event, lang, json): Promise<void> => runCache((c) => c.putBooks(lang, json), undefined),
);

handleIpc(
  'cache:getToc',
  (_event, bookId): Promise<string | null> => runCache((c) => c.getToc(bookId), null),
);
handleIpc(
  'cache:putToc',
  (_event, bookId, json): Promise<void> => runCache((c) => c.putToc(bookId, json), undefined),
);

handleIpc(
  'cache:getChapter',
  (_event, bookId, paraId): Promise<string | null> =>
    runCache((c) => c.getChapter(bookId, paraId), null),
);
handleIpc('cache:putChapter', async (_event, bookId, paraId, json): Promise<void> => {
  await runCache((c) => c.putChapter(bookId, paraId, json), undefined);
  // Mirror the chapter into the EGW paragraph index so search:fts /
  // search:refcode can find it locally. Best-effort: failures inside
  // indexChapter are logged and swallowed — search may lag, but cache writes
  // (and thus reads) never block on indexing. Fire-and-forget; the renderer
  // doesn't wait on the index either.
  if (mainRuntime !== null) {
    void indexChapter(mainRuntime, bookId, json, (touched) => {
      // Broadcast to every renderer so the Bible reader can re-query the
      // hit set for the (book, chapter) it's currently showing. Cheap to
      // send — payload is a few small numbers.
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('bible:egwCommentaryUpdated', touched);
      }
    });
  }
});
handleIpc(
  'cache:getFolders',
  (_event, lang): Promise<string | null> => runCache((c) => c.getFolders(lang), null),
);
handleIpc(
  'cache:putFolders',
  (_event, lang, json): Promise<void> => runCache((c) => c.putFolders(lang, json), undefined),
);

handleIpc(
  'cache:getFolderBooks',
  (_event, folderId, lang): Promise<string | null> =>
    runCache((c) => c.getFolderBooks(folderId, lang), null),
);
handleIpc(
  'cache:putFolderBooks',
  (_event, folderId, lang, json): Promise<void> =>
    runCache((c) => c.putFolderBooks(folderId, lang, json), undefined),
);

// How many chapters of `bookId` are currently in the cache. The renderer
// compares this to the TOC's navigable-chapter count to render a "downloaded"
// badge. Main stays schema-blind — it's just a row count.
handleIpc(
  'cache:chapterCount',
  (_event, bookId): Promise<number> => runCache((c) => c.chapterCount(bookId), 0),
);

// Last-open book/chapter — restored on launch so the app reopens where the
// user left off. Single-row table; updates overwrite. paragraph_id is the
// in-chapter scroll anchor (the topmost paragraph the user was viewing) so
// restore lands them on the exact paragraph, not just the chapter top.
handleIpc(
  'lastPosition:read',
  (): Promise<LastPositionRow | null> => runCache((c) => c.readLastPosition(), null),
);
handleIpc(
  'lastPosition:write',
  (_event, bookId, paraId, paragraphId = null): Promise<void> =>
    runCache((c) => c.writeLastPosition(bookId, paraId, paragraphId), undefined),
);
handleIpc(
  'lastPosition:clear',
  (): Promise<void> => runCache((c) => c.clearLastPosition(), undefined),
);

// Bible-mode last position — symmetric with lastPosition above but written
// from BibleReaderState changes rather than the EGW reader's scroll anchor.
// verse is nullable: the user may have opened a chapter without ever clicking
// a specific verse.
handleIpc(
  'bibleLastPosition:read',
  (): Promise<BibleLastPositionRow | null> => runCache((c) => c.readBibleLastPosition(), null),
);
handleIpc(
  'bibleLastPosition:write',
  (_event, book, chapter, verse = null): Promise<void> =>
    runCache((c) => c.writeBibleLastPosition(book, chapter, verse), undefined),
);
handleIpc(
  'bibleLastPosition:clear',
  (): Promise<void> => runCache((c) => c.clearBibleLastPosition(), undefined),
);

// Local search over the indexed EGW paragraphs. Both handlers return plain JSON
// arrays so the preload bridge can ferry them across IPC; the renderer wraps
// the shape in a Schema if it wants typed access. Returns [] when the runtime
// isn't up yet (shouldn't happen post-whenReady, but keeps the handler safe).

// Renderer-facing search hit. Main projects the AST-bearing paragraph to a
// plain-text snippet here — renderer consumers (SearchService) only need text
// for highlighting/preview, and crossing the IPC boundary with the full nodes
// array would just force re-serialization on the other side.
handleIpc(
  'search:fts',
  async (_event, query, limit, bookCode): Promise<readonly SearchHitPayload[]> => {
    if (mainRuntime === null) return [];
    const rows = await mainRuntime.runPromise(
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

// --- Diagnostic IPC -----------------------------------------------------
// Lets the renderer detect a half-initialized main process (mainRuntime null
// after `app.whenReady` should have populated it). Without this the renderer
// just sees every IPC returning empty/null and surfaces misleading
// "missing data" screens.
handleIpc('__diag:runtimeReady', (): boolean => mainRuntime !== null);

// --- KJV bible + Strong's IPC -------------------------------------------
// Data lives in bible.sqlite under the canonical Bible catalog. The bundled
// JSON assets are imported once on first launch; subsequent launches skip the
// import via the catalog status and only hit the SQL queries.

// Dev-mode wrapper: logs entry + exit (with duration + result summary) for
// every `bible:*` IPC so debugging "did the IPC even fire?" / "what did it
// return?" doesn't require re-running eval through agent-browser. Production
// builds drop the log calls so the wire isn't chatty.
const traceBibleIpc = <Args extends readonly unknown[], R>(
  channel: string,
  handler: (...args: Args) => Promise<R>,
  summarize: (result: R) => string,
): ((...args: Args) => Promise<R>) => {
  if (!isDev) return handler;
  return async (...args: Args): Promise<R> => {
    const t0 = Date.now();
    // Electron prepends the IpcMainInvokeEvent — skip it for readability.
    const payload = args
      .slice(1)
      .map((a) => (typeof a === 'string' ? `"${a}"` : String(a)))
      .join(', ');
    console.error(`[main] ${channel}(${payload})`);
    try {
      const result = await handler(...args);
      console.error(`[main] ${channel} → ${summarize(result)} (${String(Date.now() - t0)}ms)`);
      return result;
    } catch (err) {
      console.error(
        `[main] ${channel} ✗ ${err instanceof Error ? err.message : String(err)} (${String(Date.now() - t0)}ms)`,
      );
      throw err;
    }
  };
};

// Bundled main.cjs lives at apps/desktop/dist/main/main.cjs. The @bible/core
// workspace is symlinked into apps/desktop/node_modules in dev, and electron-
// builder ships the same layout in packaged builds. Resolve assets through
// __dirname so we never depend on `import.meta.url` (undefined in CJS bundles).
const coreAssetPath = (name: string): string =>
  path.join(__dirname, '..', '..', 'node_modules', '@bible', 'core', 'assets', name);

const readCoreAssetText = (name: string): string => readFileSync(coreAssetPath(name), 'utf-8');

// Read all three bundled JSON assets and run the import transaction on the
// given database service. Shared between the boot-time `ensureBibleImportsDone`
// path and the renderer-driven `bible:reimportKjv` recovery flow.
const runBundledKjvImport = (corpus: BibleCorpusService): Effect.Effect<void, SqlError> => {
  const kjv = JSON.parse(readCoreAssetText('kjv.json')) as KjvAssetFile;
  const strongs = JSON.parse(readCoreAssetText('kjv-strongs.json')) as readonly StrongsVerseAsset[];
  const lex = JSON.parse(readCoreAssetText('strongs.json')) as Record<string, StrongsLexiconAsset>;
  return corpus
    .importKjv(kjv, strongs)
    .pipe(Effect.andThen(corpus.importStrongsLexicon(lex)), Effect.asVoid);
};

// One-shot import on first launch (or after a schema-version bump dropped the
// tables). Subsequent launches hit isImported() and skip the JSON read +
// transaction entirely. The Promise is cached so concurrent IPC calls during
// startup all await the same import effect.
let bibleImportsPromise: Promise<void> | null = null;
const ensureBibleImportsDone = (runtime: MainRuntime): Promise<void> => {
  const cached = bibleImportsPromise;
  if (cached !== null) return cached;
  const fresh = runtime
    .runPromise(
      BibleCorpus.pipe(
        Effect.flatMap((corpus) =>
          corpus.status().pipe(
            Effect.flatMap((status) => {
              if (status.kjv) return Effect.asVoid(Effect.void);
              return runBundledKjvImport(corpus);
            }),
          ),
        ),
      ),
    )
    .catch((err: unknown) => {
      // Don't wedge subsequent calls on a transient import failure (a
      // half-finished tx leaves kjv_verses empty; next call should retry).
      bibleImportsPromise = null;
      throw err;
    });
  bibleImportsPromise = fresh;
  return fresh;
};

// High-frequency Strong's codes (e.g. H776 "land/earth" ~2,500 hits) would
// blow up the IPC payload; the drawer only needs enough hits to make the list
// scrollable. Caller still gets the true total via `bible:countStrongsHits`.
const CONCORDANCE_HIT_CAP = 200;
const LEXICON_RESULT_CAP = 50;

handleIpc(
  'bible:getChapter',
  traceBibleIpc(
    'bible:getChapter',
    async (_event, book, chapter): Promise<KjvChapterPayload | null> => {
      if (mainRuntime === null) return null;
      await ensureBibleImportsDone(mainRuntime);
      const verses = await mainRuntime.runPromise(
        BibleDatabase.pipe(Effect.flatMap((database) => database.getChapter(book, chapter))),
      );
      if (verses.length === 0) return null;
      return {
        book,
        bookName: getBibleBook(book)?.name ?? `Book ${String(book)}`,
        chapter,
        verses: verses.map((verse) => ({ verse: verse.verse, text: verse.text })),
      };
    },
    (r) =>
      r === null ? 'null' : `${r.bookName} ${String(r.chapter)} (${String(r.verses.length)}v)`,
  ),
);

handleIpc(
  'bible:reimportKjv',
  traceBibleIpc(
    'bible:reimportKjv',
    async (): Promise<void> => {
      if (mainRuntime === null) return;
      // Reset the cached boot Promise so any future getChapter call awaits the
      // new import effect (instead of resolving instantly against the now-empty
      // cached Promise).
      bibleImportsPromise = null;
      await mainRuntime.runPromise(
        BibleCorpus.pipe(
          Effect.flatMap((corpus) =>
            corpus.resetKjv().pipe(Effect.andThen(runBundledKjvImport(corpus)), Effect.asVoid),
          ),
        ),
      );
    },
    () => 'reimported',
  ),
);

handleIpc(
  'bible:getChapterStrongs',
  traceBibleIpc(
    'bible:getChapterStrongs',
    async (_event, book, chapter): Promise<KjvStrongsChapterPayload | null> => {
      if (mainRuntime === null) return null;
      await ensureBibleImportsDone(mainRuntime);
      const result = await mainRuntime.runPromise(
        BibleDatabase.pipe(Effect.flatMap((database) => database.getChapterStrongs(book, chapter))),
      );
      return Option.match(result, {
        onNone: () => null,
        onSome: (c): KjvStrongsChapterPayload => ({
          book: c.book,
          bookName: c.bookName,
          chapter: c.chapter,
          verses: c.verses.map((v) => ({
            verse: v.verse,
            words: v.words.map((word) => ({
              text: word.text,
              ...(word.strongsNumbers.length === 0 ? {} : { strongs: word.strongsNumbers }),
            })),
          })),
        }),
      });
    },
    (r) =>
      r === null
        ? 'null'
        : `${r.bookName} ${String(r.chapter)} (${String(r.verses.length)}v strongs)`,
  ),
);

handleIpc(
  'bible:strongsLookup',
  traceBibleIpc(
    'bible:strongsLookup',
    async (_event, code): Promise<StrongsLexiconPayload | null> => {
      if (mainRuntime === null) return null;
      await ensureBibleImportsDone(mainRuntime);
      const result = await mainRuntime.runPromise(
        BibleDatabase.pipe(Effect.flatMap((database) => database.getStrongsEntry(code))),
      );
      return Option.match(result, {
        onNone: () => null,
        onSome: (entry): StrongsLexiconPayload => ({
          code: entry.number,
          language: entry.language,
          lemma: entry.lemma,
          transliteration: entry.transliteration ?? '',
          definition: entry.definition,
        }),
      });
    },
    (r) => (r === null ? 'null' : `${r.code} ${r.lemma}`),
  ),
);

handleIpc(
  'bible:searchVersesByStrongs',
  traceBibleIpc(
    'bible:searchVersesByStrongs',
    async (_event, code): Promise<readonly ConcordanceHitPayload[]> => {
      if (mainRuntime === null) return [];
      await ensureBibleImportsDone(mainRuntime);
      const hits = await mainRuntime.runPromise(
        BibleDatabase.pipe(
          Effect.flatMap((database) => database.getVersesWithStrongs(code, CONCORDANCE_HIT_CAP)),
        ),
      );
      return hits.map(
        (h): ConcordanceHitPayload => ({
          book: h.book,
          bookName: h.bookName,
          chapter: h.chapter,
          verse: h.verse,
          text: h.text,
          word: h.word,
        }),
      );
    },
    (r) => `${String(r.length)} hit(s)`,
  ),
);

handleIpc(
  'bible:countStrongsHits',
  traceBibleIpc(
    'bible:countStrongsHits',
    async (_event, code): Promise<number> => {
      if (mainRuntime === null) return 0;
      await ensureBibleImportsDone(mainRuntime);
      return mainRuntime.runPromise(
        BibleDatabase.pipe(Effect.flatMap((database) => database.getStrongsCount(code))),
      );
    },
    (n) => `${String(n)} total`,
  ),
);

handleIpc(
  'bible:searchLexicon',
  traceBibleIpc(
    'bible:searchLexicon',
    async (_event, query): Promise<readonly StrongsLexiconPayload[]> => {
      if (mainRuntime === null) return [];
      await ensureBibleImportsDone(mainRuntime);
      const entries = await mainRuntime.runPromise(
        BibleDatabase.pipe(
          Effect.flatMap((database) => database.searchStrongs(query, LEXICON_RESULT_CAP)),
        ),
      );
      return entries.map((entry) => ({
        code: entry.number,
        language: entry.language,
        lemma: entry.lemma,
        transliteration: entry.transliteration ?? '',
        definition: entry.definition,
      }));
    },
    (r) => `${String(r.length)} entr(y/ies)`,
  ),
);

// --- Cross-reference catalog IPC ----------------------------------------
// Same first-launch-import pattern as the KJV imports above. Both openbible
// and TSKE catalogs share a JSON shape so a single importer covers both,
// re-running them is idempotent via PK upsert.
let xrefsImportsPromise: Promise<void> | null = null;
const ensureXrefsImportsDone = (runtime: MainRuntime): Promise<void> => {
  const cached = xrefsImportsPromise;
  if (cached !== null) return cached;
  const fresh = runtime.runPromise(
    BibleCorpus.pipe(
      Effect.flatMap((corpus) =>
        corpus.status().pipe(
          Effect.flatMap((status) => {
            if (status.crossReferences) return Effect.asVoid(Effect.void);
            const openbible = JSON.parse(
              readCoreAssetText('cross-refs.json'),
            ) as CrossReferenceAsset;
            const tske = JSON.parse(
              readCoreAssetText('cross-refs-tske.json'),
            ) as CrossReferenceAsset;
            return corpus
              .importCrossReferences('openbible', openbible)
              .pipe(Effect.andThen(corpus.importCrossReferences('tske', tske)), Effect.asVoid);
          }),
        ),
      ),
    ),
  );
  xrefsImportsPromise = fresh;
  return fresh;
};

handleIpc(
  'bible:getCrossRefs',
  traceBibleIpc(
    'bible:getCrossRefs',
    async (_event, book, chapter, verse): Promise<readonly CrossRefPayload[]> => {
      if (mainRuntime === null) return [];
      await ensureXrefsImportsDone(mainRuntime);
      const rows = await mainRuntime.runPromise(
        BibleDatabase.pipe(
          Effect.flatMap((database) => database.getCrossRefs(book, chapter, verse)),
        ),
      );
      return rows.flatMap((r): readonly CrossRefPayload[] =>
        r.verse === null
          ? []
          : [
              {
                source: r.source,
                targetBook: r.book,
                targetChapter: r.chapter,
                targetVerse: r.verse,
                targetVerseEnd: r.verseEnd,
              },
            ],
      );
    },
    (r) => `${String(r.length)} xref(s)`,
  ),
);

// Per-chapter "which verses have at least one cross-reference" lookup. The
// chapter renderer paints one `x` superscript per xref verse, so we return a
// plain number array — much smaller than the full per-verse rows the
// inline overlay doesn't need until the user actually clicks.
handleIpc(
  'bible:getVersesWithCrossRefs',
  traceBibleIpc(
    'bible:getVersesWithCrossRefs',
    async (_event, book, chapter): Promise<readonly number[]> => {
      if (mainRuntime === null) return [];
      await ensureXrefsImportsDone(mainRuntime);
      const verses = await mainRuntime.runPromise(
        BibleDatabase.pipe(
          Effect.flatMap((database) => database.versesWithCrossRefs(book, chapter)),
        ),
      );
      return Array.from(verses).sort((a, b) => a - b);
    },
    (r) => `${String(r.length)} verse(s) w/ xrefs`,
  ),
);

// --- Margin notes IPC ---------------------------------------------------
// Same first-launch-import pattern as the KJV + xrefs imports above. The
// bundled asset shape is `{ "book.chapter.verse": [{type, phrase, text}, ...] }`
// — one importer call covers the whole catalog, idempotent via PK upsert.
let marginNotesImportsPromise: Promise<void> | null = null;
const ensureMarginNotesImportsDone = (runtime: MainRuntime): Promise<void> => {
  const cached = marginNotesImportsPromise;
  if (cached !== null) return cached;
  const fresh = runtime.runPromise(
    BibleCorpus.pipe(
      Effect.flatMap((corpus) =>
        corpus.status().pipe(
          Effect.flatMap((status) => {
            if (status.marginNotes) return Effect.asVoid(Effect.void);
            const notes = JSON.parse(readCoreAssetText('margin-notes.json')) as MarginNotesAsset;
            return corpus.importMarginNotes(notes).pipe(Effect.asVoid);
          }),
        ),
      ),
    ),
  );
  marginNotesImportsPromise = fresh;
  return fresh;
};

handleIpc(
  'bible:getMarginNotes',
  traceBibleIpc(
    'bible:getMarginNotes',
    async (_event, book, chapter, verse): Promise<readonly MarginNotePayload[]> => {
      if (mainRuntime === null) return [];
      await ensureMarginNotesImportsDone(mainRuntime);
      const rows = await mainRuntime.runPromise(
        BibleDatabase.pipe(
          Effect.flatMap((database) => database.getMarginNotes(book, chapter, verse)),
        ),
      );
      return rows.map(
        (r): MarginNotePayload => ({
          idx: r.index,
          type: r.type,
          phrase: r.phrase,
          text: r.text,
        }),
      );
    },
    (r) => `${String(r.length)} note(s)`,
  ),
);

// Per-chapter "which verses have notes" lookup. Returns a plain sorted
// number array (Set isn't serializable across IPC). Renderer rebuilds a
// Set on its side for O(1) `.has` lookups in the verse loop.
handleIpc(
  'bible:getVersesWithNotes',
  traceBibleIpc(
    'bible:getVersesWithNotes',
    async (_event, book, chapter): Promise<readonly number[]> => {
      if (mainRuntime === null) return [];
      await ensureMarginNotesImportsDone(mainRuntime);
      const set = await mainRuntime.runPromise(
        BibleDatabase.pipe(Effect.flatMap((database) => database.versesWithNotes(book, chapter))),
      );
      return Array.from(set).sort((a, b) => a - b);
    },
    (r) => `${String(r.length)} verse(s) with notes`,
  ),
);

// All margin notes in (book, chapter) grouped by verse. One round-trip
// per chapter feeds the inline overlay so anchors can be rendered next to
// the phrase they annotate (see web verse-renderer.tsx for the model).
handleIpc(
  'bible:getChapterMarginNotes',
  traceBibleIpc(
    'bible:getChapterMarginNotes',
    async (_event, book, chapter): Promise<readonly ChapterMarginNotesPayload[]> => {
      if (mainRuntime === null) return [];
      await ensureMarginNotesImportsDone(mainRuntime);
      const byVerse = await mainRuntime.runPromise(
        BibleDatabase.pipe(
          Effect.flatMap((database) => database.chapterMarginNotes(book, chapter)),
        ),
      );
      const out: ChapterMarginNotesPayload[] = [];
      for (const [verse, notes] of byVerse) {
        out.push({
          verse,
          notes: notes.map((n) => ({
            idx: n.index,
            type: n.type,
            phrase: n.phrase,
            text: n.text,
          })),
        });
      }
      out.sort((a, b) => a.verse - b.verse);
      return out;
    },
    (r) => `${String(r.length)} verse(s) with notes`,
  ),
);

// --- EGW commentary on Bible verses --------------------------------------
// `paragraph_bible_refs` is populated incrementally by the indexer (each
// freshly-cached chapter writes its ScriptureRef rows in the same tx). For
// users who indexed chapters before the indexer learned about bible-refs,
// `ensureCommentaryBackfillDone` walks the existing paragraphs and seeds
// `paragraph_bible_refs` once. The DB-level gate skips when any row exists,
// so the steady-state boot cost is one COUNT(*).
let commentaryBackfillPromise: Promise<void> | null = null;
const ensureCommentaryBackfillDone = (runtime: MainRuntime): Promise<void> => {
  const cached = commentaryBackfillPromise;
  if (cached !== null) return cached;
  const fresh = runtime
    .runPromise(
      EGWParagraphDatabase.pipe(Effect.flatMap((db) => db.backfillBibleRefs(extractScriptureRefs))),
    )
    .then((result) => {
      if (result.scanned > 0) {
        console.error(
          `[main] EGW bible-ref backfill: scanned ${String(result.scanned)} paragraphs, inserted ${String(result.inserted)} refs`,
        );
      }
    })
    .catch((err: unknown) => {
      // Backfill is opportunistic — a failure shouldn't block commentary
      // lookups against the rows already in the table.
      console.warn('[main] EGW bible-ref backfill failed:', err);
    });
  commentaryBackfillPromise = fresh;
  return fresh;
};

handleIpc(
  'bible:getEgwCommentary',
  traceBibleIpc(
    'bible:getEgwCommentary',
    async (_event, book, chapter, verse): Promise<readonly EgwCommentaryHitPayload[]> => {
      if (mainRuntime === null) return [];
      await ensureCommentaryBackfillDone(mainRuntime);
      const rows = await mainRuntime.runPromise(
        EGWParagraphDatabase.pipe(
          Effect.flatMap((db) => db.getParagraphsByBibleRef(book, chapter, verse)),
        ),
      );
      return rows.map(
        (r): EgwCommentaryHitPayload => ({
          bookId: r.bookId,
          bookCode: r.bookCode,
          bookTitle: r.bookTitle,
          refcodeShort: Option.getOrNull(r.refcode_short),
          snippet: nodesToText(r.nodes),
          puborder: r.puborder,
        }),
      );
    },
    (r) => `${String(r.length)} commentary hit(s)`,
  ),
);

// Chapter-scoped set of verses that have at least one cached EGW paragraph.
// One round-trip per chapter so the renderer can paint footnote markers next
// to verse numbers without N per-verse queries. Mirrors the margin-notes
// `bible:getVersesWithNotes` pattern.
handleIpc(
  'bible:getBibleVersesWithCommentary',
  traceBibleIpc(
    'bible:getBibleVersesWithCommentary',
    async (_event, book, chapter): Promise<readonly number[]> => {
      if (mainRuntime === null) return [];
      await ensureCommentaryBackfillDone(mainRuntime);
      return mainRuntime.runPromise(
        EGWParagraphDatabase.pipe(
          Effect.flatMap((db) => db.getBibleVersesWithCommentary(book, chapter)),
        ),
      );
    },
    (r) => `${String(r.length)} verse(s) w/ commentary`,
  ),
);

// --- EGW live API IPC ----------------------------------------------------
// All EGW HTTP runs in main (Node fetch), not the renderer, because:
//   - the renderer's browser fetch trips on CORS preflight (EGW doesn't
//     allow `traceparent` from arbitrary origins),
//   - the OAuth client_secret has no business sitting in a renderer bundle,
//   - main can share one auth token across the app + reuse the http
//     response cache for free.
// Renderer receives JSON strings shaped exactly like the cache rows —
// EGWData decodes via the same schemas regardless of source.
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

// Surface EGW errors back to the renderer as plain rejections — the
// preload bridge ferries the message; renderer logs/handles it. We `orDie`
// the Schema/encoding step because an encoding failure for a value we
// just received from the API is a defect, not user-facing.
const runEgw = <A>(
  effect: Effect.Effect<A, unknown, EGWApiClient | EGWParagraphDatabase>,
): Promise<A> => {
  if (mainRuntime === null) {
    console.error('[runEgw] mainRuntime is null when IPC call arrived');
    return Promise.reject(new EgwIpcError({ message: 'EGW runtime not ready', cause: null }));
  }
  return mainRuntime.runPromise(
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

// `chapterId` here is the string EGW expects on `/content/books/:id/by_para/:cid`,
// derived from a TocItem on the renderer side via `chapterIdFromTocItem`.
// Renderer passes the already-derived string to keep main schema-blind to
// the TocItem shape.
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

handleIpc(
  'search:refcode',
  async (_event, refcode, limit): Promise<readonly SearchHitPayload[]> => {
    if (mainRuntime === null) return [];
    const rows = await mainRuntime.runPromise(
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

void app.whenReady().then(async () => {
  loadDotEnv(path.join(process.cwd(), '.env'));
  console.error('[main] app.whenReady → constructing mainRuntime (after edit)');
  mainRuntime = makeRuntime(cacheDbPath(), bibleDbPath(), egwTokenPath());
  // Force layer construction so the EGW paragraph DDL runs at startup
  // rather than on the first search query. Errors here are unrecoverable —
  // the layer is Layer.orDie, so a failed open throws synchronously.
  await mainRuntime.runPromise(EGWParagraphDatabase.pipe(Effect.asVoid));
  await mainRuntime.runPromise(BibleCorpus.pipe(Effect.asVoid));
  await mainRuntime.runPromise(BibleDatabase.pipe(Effect.asVoid));
  console.error('[main] EGWParagraphDatabase + BibleCorpus + BibleDatabase ready, opening window');
  // Kick off the EGW bible-ref backfill in the background. Fire-and-forget
  // so window paint isn't blocked; the IPC handler awaits the same Promise
  // before serving the first commentary query.
  //
  // When backfill finishes, broadcast an empty-touched pulse so any
  // renderer that already mounted the Bible canvas and cached an empty
  // hit set (queried before refs were written) clears its LRU and
  // re-queries. Cheap signal — one IPC message per cold launch.
  void ensureCommentaryBackfillDone(mainRuntime).then(() => {
    console.error('[main] EGW commentary backfill complete, broadcasting pulse');
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('bible:egwCommentaryUpdated', []);
    }
  });
  // Re-index any chapter blobs that were cached before the paragraph indexer
  // existed (or before its boot path ran). Fire-and-forget — local refcode /
  // FTS search will just light up once it lands.
  void backfillIndex(mainRuntime).catch((err: unknown) => {
    console.warn('[main] backfillIndex failed:', err);
  });
  void createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', (event) => {
  if (mainRuntime !== null) {
    // ManagedRuntime.dispose returns a Promise; defer quit until cleanup
    // finishes so the sqlite-node connection (the single owner of cache.sqlite)
    // releases the WAL file cleanly.
    event.preventDefault();
    const runtime = mainRuntime;
    mainRuntime = null;
    void runtime.dispose().then(() => app.quit());
  }
});
