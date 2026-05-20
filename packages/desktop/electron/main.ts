import { EGWApiClient, Schemas } from '@bible/core/egw';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import Database from 'better-sqlite3';
import { Effect, Schema, Stream } from 'effect';

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
    -- is also valid state to persist.
    CREATE TABLE IF NOT EXISTS last_position (
      id INTEGER PRIMARY KEY CHECK (id = 0),
      book_id INTEGER NOT NULL,
      para_id TEXT,
      updated_at INTEGER NOT NULL
    );
  `);
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

const createWindow = async (): Promise<void> => {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
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
    void indexChapter(mainRuntime, getCacheDb(), bookId, json);
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
// user left off. Single-row table; updates overwrite.
type LastPositionRow = { readonly book_id: number; readonly para_id: string | null };
ipcMain.handle('lastPosition:read', (): LastPositionRow | null => {
  const row = getCacheDb()
    .prepare<[], LastPositionRow>('SELECT book_id, para_id FROM last_position WHERE id = 0')
    .get();
  return row ?? null;
});
ipcMain.handle('lastPosition:write', (_event, bookId: number, paraId: string | null): void => {
  getCacheDb()
    .prepare(
      'INSERT INTO last_position (id, book_id, para_id, updated_at) VALUES (0, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET book_id = excluded.book_id, para_id = excluded.para_id, updated_at = excluded.updated_at',
    )
    .run(bookId, paraId, now());
});
ipcMain.handle('lastPosition:clear', (): void => {
  getCacheDb().prepare('DELETE FROM last_position').run();
});

// Local search over the indexed EGW paragraphs. Both handlers return plain JSON
// arrays so the preload bridge can ferry them across IPC; the renderer wraps
// the shape in a Schema if it wants typed access. Returns [] when the runtime
// isn't up yet (shouldn't happen post-whenReady, but keeps the handler safe).

type SearchHitPayload = {
  readonly bookId: number;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly paraId: string | null;
  readonly refcodeShort: string | null;
  readonly content: string | null;
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
      content: r.content ?? null,
      puborder: r.puborder,
    }));
  },
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
      content: r.content ?? null,
      puborder: r.puborder,
    }));
  },
);

void app.whenReady().then(async () => {
  loadDotEnv(path.join(process.cwd(), '.env'));
  mainRuntime = makeRuntime(cacheDbPath(), egwTokenPath());
  // Force layer construction so the EGW paragraph DDL runs at startup
  // rather than on the first search query. Errors here are unrecoverable —
  // the layer is Layer.orDie, so a failed open throws synchronously.
  await mainRuntime.runPromise(EGWParagraphDatabase.pipe(Effect.asVoid));
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
