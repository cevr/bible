import { BibleCorpus, BibleDatabase } from '@bible/core/bible-db';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { Effect } from 'effect';
import { app, BrowserWindow, shell } from 'electron';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { backfillIndex } from './indexer.js';
import { makeBibleIpc } from './ipc/bible-handlers.js';
import { registerEgwIpc } from './ipc/egw-handlers.js';
import { handleIpc } from './ipc/handle.js';
import { registerStorageIpc } from './ipc/storage-handlers.js';
import { makeRuntime, type MainRuntime } from './runtime.js';

// Tiny .env loader for the plain Electron bootstrap. The Effect runtime reads
// its configuration after this has populated process.env.
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

// eslint-disable-next-line node/no-process-env -- Electron bootstrap
const isDev = process.env['NODE_ENV'] === 'development';
const VITE_DEV_URL = 'http://localhost:1420';

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const cacheDbPath = () => path.join(app.getPath('userData'), 'cache.sqlite');
const bibleDbPath = () => path.join(app.getPath('userData'), 'bible.sqlite');
const userStateDbPath = () => path.join(app.getPath('userData'), 'user-state.sqlite');
const egwTokenPath = () => path.join(app.getPath('userData'), 'egw-tokens.json');

let mainRuntime: MainRuntime | null = null;
const getRuntime = (): MainRuntime | null => mainRuntime;

const bibleIpc = makeBibleIpc({ getRuntime, isDev });
bibleIpc.register();
registerEgwIpc(getRuntime);
registerStorageIpc({ getRuntime, settingsFile: settingsPath });
handleIpc('__diag:runtimeReady', (): boolean => mainRuntime !== null);

const resolveWindowIcon = (): string | undefined => {
  const candidates = [
    path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    path.join(process.resourcesPath, 'assets', 'icon.png'),
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Try the packaged/development alternative.
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

void app.whenReady().then(async () => {
  loadDotEnv(path.join(process.cwd(), '.env'));
  console.error('[main] app.whenReady → constructing main runtime');
  const runtime = makeRuntime(cacheDbPath(), bibleDbPath(), egwTokenPath(), userStateDbPath());
  mainRuntime = runtime;

  // Construct every persistent module before opening a renderer. This runs
  // DDL/migrations now instead of making the first user operation pay for it.
  await runtime.runPromise(EGWParagraphDatabase.pipe(Effect.asVoid));
  await runtime.runPromise(BibleCorpus.pipe(Effect.asVoid));
  await runtime.runPromise(BibleDatabase.pipe(Effect.asVoid));
  console.error('[main] persistence modules ready, opening window');

  // Commentary backfill and legacy chapter indexing are opportunistic. Their
  // handler modules own the work; bootstrap only schedules lifecycle timing.
  void bibleIpc.ensureCommentaryBackfillDone(runtime).then(() => {
    console.error('[main] EGW commentary backfill complete, broadcasting pulse');
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('bible:egwCommentaryUpdated', []);
    }
  });
  void backfillIndex(runtime).catch((error: unknown) => {
    console.warn('[main] backfillIndex failed:', error);
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
  const runtime = mainRuntime;
  if (runtime === null) return;
  event.preventDefault();
  mainRuntime = null;
  void runtime.dispose().then(() => app.quit());
});
