import {
  BibleMarginNotesDatabase,
  type MarginNotesCatalog,
} from '@bible/core/bible-margin-notes-db';
import { BibleXrefsDatabase, type XrefCatalog } from '@bible/core/bible-xrefs-db';
import { EGWApiClient, extractScriptureRefs, nodesToText, Schemas } from '@bible/core/egw';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import {
  KjvBibleDatabase,
  type KjvAssetFile,
  type KjvBibleDatabaseService,
  type KjvStrongsChapterPayload,
  type StrongsLexiconEntry,
  type StrongsLexiconRaw,
  type StrongsVerseRow,
} from '@bible/core/kjv-bible-db';
import Database from 'better-sqlite3';
import { Effect, Option, Schema, Stream } from 'effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';

class EgwIpcError extends Schema.TaggedErrorClass<EgwIpcError>()('EgwIpcError', {
  message: Schema.String,
  cause: Schema.Unknown,
}) {}
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';

import { indexChapter } from './indexer.js';
import { makeRuntime, type MainRuntime } from './runtime.js';

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

const settingsPath = () => path.join(app.getPath('userData'), SETTINGS_FILENAME);
const cacheDbPath = () => path.join(app.getPath('userData'), CACHE_FILENAME);
const egwTokenPath = () => path.join(app.getPath('userData'), EGW_TOKEN_FILENAME);

// Lazy sqlite handle — initialized on first cache call, not at module load,
// because app.getPath('userData') requires app.whenReady() to have fired.
// All cache rows store the raw JSON string the EGW API returned; the renderer
// re-runs Schema.decodeUnknown against the same shape it would use for a live
// response, so cache hits and live fetches converge through one parse path.
let cacheDb: Database.Database | null = null;

// Effect runtime hosting EGWParagraphDatabase over @effect/sql-sqlite-node,
// pointed at the same cache.sqlite file. Started after app.whenReady() so
// userData path is resolvable; disposed on will-quit.
let mainRuntime: MainRuntime | null = null;
const getCacheDb = (): Database.Database => {
  if (cacheDb !== null) return cacheDb;
  const db = new Database(cacheDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Cache tables live alongside the EGW paragraph DB tables (books, paragraphs,
  // paragraphs_fts, ...) in the same sqlite file. Names must not collide — the
  // EGW DB owns `books` as normalized metadata, so the API-response cache uses
  // `book_lists` to make the difference loud.
  db.exec(`
    CREATE TABLE IF NOT EXISTS book_lists (
      book_id INTEGER PRIMARY KEY,
      lang TEXT NOT NULL,
      json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS book_lists_lang ON book_lists(lang);

    CREATE TABLE IF NOT EXISTS tocs (
      book_id INTEGER PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chapters (
      book_id INTEGER NOT NULL,
      para_id TEXT NOT NULL,
      json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (book_id, para_id)
    );

    -- Recursive folder tree per language. One row per lang holds the entire
    -- nested response from /content/languages/:lang/folders.
    CREATE TABLE IF NOT EXISTS folders (
      lang TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Books listed under a specific folder for a specific language. Keyed by
    -- (folder_id, lang) because /content/books/by_folder/:id can be filtered
    -- by trans=lang.
    CREATE TABLE IF NOT EXISTS folder_books (
      folder_id INTEGER NOT NULL,
      lang TEXT NOT NULL,
      json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (folder_id, lang)
    );

    -- Single-row table (id = 0): the last book + chapter the user had open.
    -- Restored on launch so the app reopens to where they left off. para_id
    -- is nullable: a book opened without a chapter selection (TOC view only)
    -- is also valid state to persist. paragraph_id (added later) carries the
    -- in-chapter scroll position so we restore to the exact paragraph the
    -- user was last viewing, not just the chapter top.
    CREATE TABLE IF NOT EXISTS last_position (
      id INTEGER PRIMARY KEY CHECK (id = 0),
      book_id INTEGER NOT NULL,
      para_id TEXT,
      updated_at INTEGER NOT NULL
    );

    -- Sibling single-row table (id = 0) for Bible mode: which (book, chapter,
    -- verse) the user was last looking at. Stored separately from last_position
    -- so the two reading modes restore independently — switching modes on
    -- launch shouldn't reset the other mode's place. verse is nullable for the
    -- case where the user opened a chapter but never clicked a specific verse.
    CREATE TABLE IF NOT EXISTS bible_last_position (
      id INTEGER PRIMARY KEY CHECK (id = 0),
      book INTEGER NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER,
      updated_at INTEGER NOT NULL
    );

    -- NOTE: kjv_verses + strongs_lexicon are created and owned by
    -- KjvBibleDatabase.layerCore (packages/core/src/kjv-bible-db). They share
    -- this same cache.sqlite file but their DDL belongs to the service, not
    -- to this raw-sqlite cache module.
  `);
  // Additive migration: older DBs created last_position without paragraph_id.
  // SQLite has no "ADD COLUMN IF NOT EXISTS"; the duplicate-column error is the
  // expected outcome on already-migrated DBs and is safe to swallow.
  try {
    db.exec('ALTER TABLE last_position ADD COLUMN paragraph_id TEXT');
  } catch (err) {
    if (!(err instanceof Error && err.message.includes('duplicate column'))) throw err;
  }
  cacheDb = db;
  return db;
};

const now = (): number => Date.now();

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

ipcMain.handle('settings:read', () => readJsonFile(settingsPath()));
ipcMain.handle('settings:write', (_event, text: string) => writeJsonFile(settingsPath(), text));

// Cache IPC — get returns null on miss, put is upsert. The renderer is
// responsible for Schema parsing on the way out and Schema encoding on the
// way in, so main only ever sees opaque JSON strings.
ipcMain.handle('cache:getBooks', (_event, lang: string): string | null => {
  const row = getCacheDb()
    .prepare<[string], { json: string }>('SELECT json FROM book_lists WHERE lang = ? LIMIT 1')
    .get(lang);
  return row?.json ?? null;
});
ipcMain.handle('cache:putBooks', (_event, lang: string, json: string): void => {
  // Single-row-per-lang model: a fresh list response replaces the previous one
  // wholesale. If we ever care about per-book diffing, switch this to
  // explode the array into per-book rows here.
  const db = getCacheDb();
  db.prepare('DELETE FROM book_lists WHERE lang = ?').run(lang);
  db.prepare('INSERT INTO book_lists (book_id, lang, json, updated_at) VALUES (0, ?, ?, ?)').run(
    lang,
    json,
    now(),
  );
});

ipcMain.handle('cache:getToc', (_event, bookId: number): string | null => {
  const row = getCacheDb()
    .prepare<[number], { json: string }>('SELECT json FROM tocs WHERE book_id = ?')
    .get(bookId);
  return row?.json ?? null;
});
ipcMain.handle('cache:putToc', (_event, bookId: number, json: string): void => {
  getCacheDb()
    .prepare(
      'INSERT INTO tocs (book_id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(book_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
    )
    .run(bookId, json, now());
});

ipcMain.handle('cache:getChapter', (_event, bookId: number, paraId: string): string | null => {
  const row = getCacheDb()
    .prepare<[number, string], { json: string }>(
      'SELECT json FROM chapters WHERE book_id = ? AND para_id = ?',
    )
    .get(bookId, paraId);
  return row?.json ?? null;
});
ipcMain.handle('cache:putChapter', (_event, bookId: number, paraId: string, json: string): void => {
  getCacheDb()
    .prepare(
      'INSERT INTO chapters (book_id, para_id, json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(book_id, para_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
    )
    .run(bookId, paraId, json, now());
  // Mirror the chapter into the EGW paragraph index so search:fts /
  // search:refcode can find it locally. Best-effort: failures inside
  // indexChapter are logged and swallowed — search may lag, but cache writes
  // (and thus reads) never block on indexing. Fire-and-forget Promise; the IPC
  // handler returns void immediately because the renderer doesn't wait on the
  // index either.
  if (mainRuntime !== null) {
    void indexChapter(mainRuntime, getCacheDb(), bookId, json, (touched) => {
      // Broadcast to every renderer so the Bible reader can re-query the
      // hit set for the (book, chapter) it's currently showing. Cheap to
      // send — payload is a few small numbers.
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('bible:egwCommentaryUpdated', touched);
      }
    });
  }
});
ipcMain.handle('cache:getFolders', (_event, lang: string): string | null => {
  const row = getCacheDb()
    .prepare<[string], { json: string }>('SELECT json FROM folders WHERE lang = ?')
    .get(lang);
  return row?.json ?? null;
});
ipcMain.handle('cache:putFolders', (_event, lang: string, json: string): void => {
  getCacheDb()
    .prepare(
      'INSERT INTO folders (lang, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(lang) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
    )
    .run(lang, json, now());
});

ipcMain.handle('cache:getFolderBooks', (_event, folderId: number, lang: string): string | null => {
  const row = getCacheDb()
    .prepare<[number, string], { json: string }>(
      'SELECT json FROM folder_books WHERE folder_id = ? AND lang = ?',
    )
    .get(folderId, lang);
  return row?.json ?? null;
});
ipcMain.handle(
  'cache:putFolderBooks',
  (_event, folderId: number, lang: string, json: string): void => {
    getCacheDb()
      .prepare(
        'INSERT INTO folder_books (folder_id, lang, json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(folder_id, lang) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
      )
      .run(folderId, lang, json, now());
  },
);

// How many chapters of `bookId` are currently in the cache. The renderer
// compares this to the TOC's navigable-chapter count to render a "downloaded"
// badge. Main stays schema-blind — it's just a row count.
ipcMain.handle('cache:chapterCount', (_event, bookId: number): number => {
  const row = getCacheDb()
    .prepare<[number], { count: number }>(
      'SELECT COUNT(*) AS count FROM chapters WHERE book_id = ?',
    )
    .get(bookId);
  return row?.count ?? 0;
});

// Last-open book/chapter — restored on launch so the app reopens where the
// user left off. Single-row table; updates overwrite. paragraph_id is the
// in-chapter scroll anchor (the topmost paragraph the user was viewing) so
// restore lands them on the exact paragraph, not just the chapter top.
type LastPositionRow = {
  readonly book_id: number;
  readonly para_id: string | null;
  readonly paragraph_id: string | null;
};
ipcMain.handle('lastPosition:read', (): LastPositionRow | null => {
  const row = getCacheDb()
    .prepare<[], LastPositionRow>(
      'SELECT book_id, para_id, paragraph_id FROM last_position WHERE id = 0',
    )
    .get();
  return row ?? null;
});
ipcMain.handle(
  'lastPosition:write',
  (_event, bookId: number, paraId: string | null, paragraphId: string | null = null): void => {
    getCacheDb()
      .prepare(
        'INSERT INTO last_position (id, book_id, para_id, paragraph_id, updated_at) VALUES (0, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET book_id = excluded.book_id, para_id = excluded.para_id, paragraph_id = excluded.paragraph_id, updated_at = excluded.updated_at',
      )
      .run(bookId, paraId, paragraphId, now());
  },
);
ipcMain.handle('lastPosition:clear', (): void => {
  getCacheDb().prepare('DELETE FROM last_position').run();
});

// Bible-mode last position — symmetric with lastPosition above but written
// from BibleReaderState changes rather than the EGW reader's scroll anchor.
// verse is nullable: the user may have opened a chapter without ever clicking
// a specific verse.
type BibleLastPositionRow = {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number | null;
};
ipcMain.handle('bibleLastPosition:read', (): BibleLastPositionRow | null => {
  const row = getCacheDb()
    .prepare<[], BibleLastPositionRow>(
      'SELECT book, chapter, verse FROM bible_last_position WHERE id = 0',
    )
    .get();
  return row ?? null;
});
ipcMain.handle(
  'bibleLastPosition:write',
  (_event, book: number, chapter: number, verse: number | null = null): void => {
    getCacheDb()
      .prepare(
        'INSERT INTO bible_last_position (id, book, chapter, verse, updated_at) VALUES (0, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET book = excluded.book, chapter = excluded.chapter, verse = excluded.verse, updated_at = excluded.updated_at',
      )
      .run(book, chapter, verse, now());
  },
);
ipcMain.handle('bibleLastPosition:clear', (): void => {
  getCacheDb().prepare('DELETE FROM bible_last_position').run();
});

// Local search over the indexed EGW paragraphs. Both handlers return plain JSON
// arrays so the preload bridge can ferry them across IPC; the renderer wraps
// the shape in a Schema if it wants typed access. Returns [] when the runtime
// isn't up yet (shouldn't happen post-whenReady, but keeps the handler safe).

// Renderer-facing search hit. Main projects the AST-bearing paragraph to a
// plain-text snippet here — renderer consumers (SearchService) only need text
// for highlighting/preview, and crossing the IPC boundary with the full nodes
// array would just force re-serialization on the other side.
type SearchHitPayload = {
  readonly bookId: number;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly paraId: string | null;
  readonly refcodeShort: string | null;
  readonly snippet: string;
  readonly puborder: number;
};

ipcMain.handle(
  'search:fts',
  async (
    _event,
    query: string,
    limit: number | undefined,
    bookCode: string | undefined,
  ): Promise<readonly SearchHitPayload[]> => {
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
      paraId: r.para_id ?? null,
      refcodeShort: r.refcode_short ?? null,
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
ipcMain.handle('__diag:runtimeReady', (): boolean => mainRuntime !== null);

// --- KJV bible + Strong's IPC -------------------------------------------
// Data lives in cache.sqlite (kjv_verses, strongs_lexicon tables owned by
// KjvBibleDatabase.layerCore). The bundled JSON assets are imported once on
// first launch — subsequent launches skip the import via isImported() and
// only hit the SQL queries.

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
    // ipcMain.handle prepends the IpcMainInvokeEvent — skip it for readability.
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

// re-export types that other electron modules import
export type { KjvStrongsChapterPayload, StrongsLexiconEntry };

// Bundled main.cjs lives at packages/desktop/dist/main/main.cjs. The @bible/core
// workspace is symlinked into packages/desktop/node_modules in dev, and electron-
// builder ships the same layout in packaged builds. Resolve assets through
// __dirname so we never depend on `import.meta.url` (undefined in CJS bundles).
const coreAssetPath = (name: string): string =>
  path.join(__dirname, '..', '..', 'node_modules', '@bible', 'core', 'assets', name);

const readCoreAssetText = (name: string): string => readFileSync(coreAssetPath(name), 'utf-8');

// Read all three bundled JSON assets and run the import transaction on the
// given database service. Shared between the boot-time `ensureBibleImportsDone`
// path and the renderer-driven `bible:reimportKjv` recovery flow.
const runBundledKjvImport = (db: KjvBibleDatabaseService): Effect.Effect<void, SqlError> => {
  const kjv = JSON.parse(readCoreAssetText('kjv.json')) as KjvAssetFile;
  const strongs = JSON.parse(readCoreAssetText('kjv-strongs.json')) as readonly StrongsVerseRow[];
  const lex = JSON.parse(readCoreAssetText('strongs.json')) as Record<string, StrongsLexiconRaw>;
  return db
    .importKjv(kjv, strongs)
    .pipe(Effect.andThen(db.importStrongsLexicon(lex)), Effect.asVoid);
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
      KjvBibleDatabase.pipe(
        Effect.flatMap((db) =>
          db.isImported().pipe(
            Effect.flatMap((done) => {
              if (done) return Effect.asVoid(Effect.void);
              return runBundledKjvImport(db);
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

// Renderer-facing shapes (camelCase, plus only the fields the preload exposes).
// The service emits snake_case SQL rows; we project here so the IPC contract
// matches what preload.ts declares and the renderer already consumes.
type RendererKjvChapter = {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verses: readonly { readonly verse: number; readonly text: string }[];
};
type RendererKjvStrongsChapter = {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verses: readonly {
    readonly verse: number;
    readonly words: readonly { readonly text: string; readonly strongs?: readonly string[] }[];
  }[];
};
type RendererStrongsEntry = {
  readonly code: string;
  readonly language: 'hebrew' | 'greek';
  readonly lemma: string;
  readonly transliteration: string;
  readonly definition: string;
};

ipcMain.handle(
  'bible:getChapter',
  traceBibleIpc(
    'bible:getChapter',
    async (_event, book: number, chapter: number): Promise<RendererKjvChapter | null> => {
      if (mainRuntime === null) return null;
      await ensureBibleImportsDone(mainRuntime);
      const result = await mainRuntime.runPromise(
        KjvBibleDatabase.pipe(Effect.flatMap((db) => db.getChapter(book, chapter))),
      );
      return Option.match(result, {
        onNone: () => null,
        onSome: (c): RendererKjvChapter => ({
          book: c.book,
          bookName: c.book_name,
          chapter: c.chapter,
          verses: c.verses.map((v) => ({ verse: v.verse, text: v.text })),
        }),
      });
    },
    (r) =>
      r === null ? 'null' : `${r.bookName} ${String(r.chapter)} (${String(r.verses.length)}v)`,
  ),
);

ipcMain.handle(
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
        KjvBibleDatabase.pipe(
          Effect.flatMap((db) =>
            db.resetTables().pipe(Effect.andThen(runBundledKjvImport(db)), Effect.asVoid),
          ),
        ),
      );
    },
    () => 'reimported',
  ),
);

ipcMain.handle(
  'bible:getChapterStrongs',
  traceBibleIpc(
    'bible:getChapterStrongs',
    async (_event, book: number, chapter: number): Promise<RendererKjvStrongsChapter | null> => {
      if (mainRuntime === null) return null;
      await ensureBibleImportsDone(mainRuntime);
      const result = await mainRuntime.runPromise(
        KjvBibleDatabase.pipe(Effect.flatMap((db) => db.getChapterStrongs(book, chapter))),
      );
      return Option.match(result, {
        onNone: () => null,
        onSome: (c): RendererKjvStrongsChapter => ({
          book: c.book,
          bookName: c.book_name,
          chapter: c.chapter,
          verses: c.verses.map((v) => ({ verse: v.verse, words: v.words })),
        }),
      });
    },
    (r) =>
      r === null
        ? 'null'
        : `${r.bookName} ${String(r.chapter)} (${String(r.verses.length)}v strongs)`,
  ),
);

ipcMain.handle(
  'bible:strongsLookup',
  traceBibleIpc(
    'bible:strongsLookup',
    async (_event, code: string): Promise<RendererStrongsEntry | null> => {
      if (mainRuntime === null) return null;
      await ensureBibleImportsDone(mainRuntime);
      const result = await mainRuntime.runPromise(
        KjvBibleDatabase.pipe(Effect.flatMap((db) => db.strongsLookup(code))),
      );
      return Option.getOrNull(result);
    },
    (r) => (r === null ? 'null' : `${r.code} ${r.lemma}`),
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
    BibleXrefsDatabase.pipe(
      Effect.flatMap((db) =>
        db.isImported().pipe(
          Effect.flatMap((done) => {
            if (done) return Effect.asVoid(Effect.void);
            const openbible = JSON.parse(readCoreAssetText('cross-refs.json')) as XrefCatalog;
            const tske = JSON.parse(readCoreAssetText('cross-refs-tske.json')) as XrefCatalog;
            return db
              .importCatalog('openbible', openbible)
              .pipe(Effect.andThen(db.importCatalog('tske', tske)), Effect.asVoid);
          }),
        ),
      ),
    ),
  );
  xrefsImportsPromise = fresh;
  return fresh;
};

// Renderer-facing cross-ref row. camelCase mirrors the service's CrossRefRow
// shape exactly (the service already projects out of snake_case columns) so we
// can pass it straight through, but we re-declare here to lock the IPC
// contract independently of the core service shape.
type RendererCrossRef = {
  readonly source: 'openbible' | 'tske';
  readonly targetBook: number;
  readonly targetChapter: number;
  readonly targetVerse: number;
  readonly targetVerseEnd: number | null;
};

ipcMain.handle(
  'bible:getCrossRefs',
  traceBibleIpc(
    'bible:getCrossRefs',
    async (
      _event,
      book: number,
      chapter: number,
      verse: number,
    ): Promise<readonly RendererCrossRef[]> => {
      if (mainRuntime === null) return [];
      await ensureXrefsImportsDone(mainRuntime);
      const rows = await mainRuntime.runPromise(
        BibleXrefsDatabase.pipe(Effect.flatMap((db) => db.getCrossRefs(book, chapter, verse))),
      );
      return rows.map(
        (r): RendererCrossRef => ({
          source: r.source,
          targetBook: r.targetBook,
          targetChapter: r.targetChapter,
          targetVerse: r.targetVerse,
          targetVerseEnd: r.targetVerseEnd,
        }),
      );
    },
    (r) => `${String(r.length)} xref(s)`,
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
    BibleMarginNotesDatabase.pipe(
      Effect.flatMap((db) =>
        db.isImported().pipe(
          Effect.flatMap((done) => {
            if (done) return Effect.asVoid(Effect.void);
            const notes = JSON.parse(readCoreAssetText('margin-notes.json')) as MarginNotesCatalog;
            return db.importCatalog(notes).pipe(Effect.asVoid);
          }),
        ),
      ),
    ),
  );
  marginNotesImportsPromise = fresh;
  return fresh;
};

// Renderer-facing margin-note row. camelCase mirrors the service's
// MarginNoteRow shape — re-declared here to lock the IPC contract
// independently of the core service shape.
type RendererMarginNote = {
  readonly idx: number;
  readonly type: 'hebrew' | 'alternate' | 'other' | 'greek' | 'name';
  readonly phrase: string;
  readonly text: string;
};

ipcMain.handle(
  'bible:getMarginNotes',
  traceBibleIpc(
    'bible:getMarginNotes',
    async (
      _event,
      book: number,
      chapter: number,
      verse: number,
    ): Promise<readonly RendererMarginNote[]> => {
      if (mainRuntime === null) return [];
      await ensureMarginNotesImportsDone(mainRuntime);
      const rows = await mainRuntime.runPromise(
        BibleMarginNotesDatabase.pipe(
          Effect.flatMap((db) => db.getMarginNotes(book, chapter, verse)),
        ),
      );
      return rows.map(
        (r): RendererMarginNote => ({
          idx: r.idx,
          type: r.type,
          phrase: r.phrase,
          text: r.text,
        }),
      );
    },
    (r) => `${String(r.length)} note(s)`,
  ),
);

// Per-chapter "which verses have notes" lookup. The renderer renders one
// superscript anchor per noted verse, so we return a plain array of
// `[verse, count]` pairs (Map isn't serializable across IPC). Caller
// reconstitutes a Map on the renderer side if it wants O(1) lookup.
ipcMain.handle(
  'bible:getVersesWithNotes',
  traceBibleIpc(
    'bible:getVersesWithNotes',
    async (
      _event,
      book: number,
      chapter: number,
    ): Promise<readonly { readonly verse: number; readonly count: number }[]> => {
      if (mainRuntime === null) return [];
      await ensureMarginNotesImportsDone(mainRuntime);
      const map = await mainRuntime.runPromise(
        BibleMarginNotesDatabase.pipe(Effect.flatMap((db) => db.versesWithNotes(book, chapter))),
      );
      const out: { readonly verse: number; readonly count: number }[] = [];
      for (const [verse, count] of map) out.push({ verse, count });
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

// Renderer-facing commentary hit. Carries enough to render a list item and
// click through to the reader: book metadata + the paragraph snippet + the
// refcode (which the reader navigates by).
type EgwCommentaryHit = {
  readonly bookId: number;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly refcodeShort: string | null;
  readonly snippet: string;
  readonly puborder: number;
};

ipcMain.handle(
  'bible:getEgwCommentary',
  traceBibleIpc(
    'bible:getEgwCommentary',
    async (
      _event,
      book: number,
      chapter: number,
      verse: number,
    ): Promise<readonly EgwCommentaryHit[]> => {
      if (mainRuntime === null) return [];
      await ensureCommentaryBackfillDone(mainRuntime);
      const rows = await mainRuntime.runPromise(
        EGWParagraphDatabase.pipe(
          Effect.flatMap((db) => db.getParagraphsByBibleRef(book, chapter, verse)),
        ),
      );
      return rows.map(
        (r): EgwCommentaryHit => ({
          bookId: r.bookId,
          bookCode: r.bookCode,
          bookTitle: r.bookTitle,
          refcodeShort: r.refcode_short ?? null,
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
ipcMain.handle(
  'bible:getBibleVersesWithCommentary',
  traceBibleIpc(
    'bible:getBibleVersesWithCommentary',
    async (_event, book: number, chapter: number): Promise<readonly number[]> => {
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
        Effect.fail(new EgwIpcError({ message: `EGW request failed: ${String(cause)}`, cause })),
      ),
    ),
  );
};

ipcMain.handle(
  'egw:fetchBooks',
  async (_event, lang: string): Promise<string> =>
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

ipcMain.handle(
  'egw:fetchToc',
  async (_event, bookId: number): Promise<string> =>
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
ipcMain.handle(
  'egw:fetchChapter',
  async (_event, bookId: number, chapterId: string): Promise<string> =>
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

ipcMain.handle(
  'egw:search',
  async (_event, query: string, limit: number | undefined): Promise<string> =>
    runEgw(
      EGWApiClient.pipe(
        Effect.flatMap((client) =>
          client.search({ query, limit }).pipe(Effect.flatMap(encodeSearchJson)),
        ),
      ),
    ),
);

ipcMain.handle(
  'egw:fetchFolders',
  async (_event, lang: string): Promise<string> =>
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

ipcMain.handle(
  'egw:fetchBooksByFolder',
  async (_event, folderId: number, lang: string): Promise<string> =>
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

ipcMain.handle(
  'search:refcode',
  async (
    _event,
    refcode: string,
    limit: number | undefined,
  ): Promise<readonly SearchHitPayload[]> => {
    if (mainRuntime === null) return [];
    const rows = await mainRuntime.runPromise(
      EGWParagraphDatabase.pipe(Effect.flatMap((db) => db.findByRefcodeShort(refcode, limit))),
    );
    return rows.map((r) => ({
      bookId: r.bookId,
      bookCode: r.bookCode,
      bookTitle: r.bookTitle,
      paraId: r.para_id ?? null,
      refcodeShort: r.refcode_short ?? null,
      snippet: nodesToText(r.nodes),
      puborder: r.puborder,
    }));
  },
);

void app.whenReady().then(async () => {
  loadDotEnv(path.join(process.cwd(), '.env'));
  console.error('[main] app.whenReady → constructing mainRuntime (after edit)');
  mainRuntime = makeRuntime(cacheDbPath(), egwTokenPath());
  // Force layer construction so the EGW paragraph DDL runs at startup
  // rather than on the first search query. Errors here are unrecoverable —
  // the layer is Layer.orDie, so a failed open throws synchronously.
  await mainRuntime.runPromise(EGWParagraphDatabase.pipe(Effect.asVoid));
  await mainRuntime.runPromise(KjvBibleDatabase.pipe(Effect.asVoid));
  await mainRuntime.runPromise(BibleXrefsDatabase.pipe(Effect.asVoid));
  await mainRuntime.runPromise(BibleMarginNotesDatabase.pipe(Effect.asVoid));
  console.error(
    '[main] EGWParagraphDatabase + KjvBibleDatabase + BibleXrefsDatabase + BibleMarginNotesDatabase ready, opening window',
  );
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
  void createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', (event) => {
  if (cacheDb !== null) {
    cacheDb.close();
    cacheDb = null;
  }
  if (mainRuntime !== null) {
    // ManagedRuntime.dispose returns a Promise; defer quit until cleanup
    // finishes so the sqlite-node connection releases the WAL file cleanly.
    event.preventDefault();
    const runtime = mainRuntime;
    mainRuntime = null;
    void runtime.dispose().then(() => app.quit());
  }
});
