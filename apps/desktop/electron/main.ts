import { BibleCorpus, BibleDatabase } from '@bible/core/bible-db';
import {
  BIBLE_ARTIFACT_RELEASE,
  type CorpusActivation,
  CorpusSupply,
  Target,
  topicsReleaseSource,
} from '@bible/core/corpus-supply';
import { failureCategory } from '@bible/core/observability';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import userStateMigrationSql from '@bible/core/local-first/migrations/0001_user_state.sql';
import { Effect, Fiber, Layer, Option } from 'effect';
import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, shell } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { DesktopProcedurePortMessage } from '../shared/procedure-channel.js';
import { layerNativeBibleArtifacts, layerNativeTopicsArtifacts } from './bible-corpus-file.js';
import {
  layerDesktopProcedureServer,
  type DesktopProcedureServerPort,
} from './procedure-server.js';
import { makeRuntime, type MainRuntime } from './runtime.js';
import { prepareDesktopUserState } from './user-state-generation.js';

// Tiny .env loader for the plain Electron bootstrap. The Effect runtime reads
// its configuration after this has populated process.env.
const loadDotEnv = (file: string): void => {
  const text = Effect.runSync(Effect.option(Effect.try(() => readFileSync(file, 'utf-8'))));
  if (Option.isNone(text)) return;
  for (const rawLine of text.value.split('\n')) {
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
    if (!(key in process.env)) process.env[key] = value;
  }
};

// eslint-disable-next-line node/no-process-env -- Electron bootstrap
const isDev = process.env['NODE_ENV'] === 'development';
const VITE_DEV_URL = 'http://localhost:1420';

const nonEmpty = (value: string) => value !== '';

// Tests and portable hosts can isolate Electron's writable state without
// changing any shared application or persistence behavior.
const configuredUserDataPath = Option.filter(
  // eslint-disable-next-line node/no-process-env -- Electron bootstrap boundary
  Option.fromUndefinedOr(process.env['BIBLE_USER_DATA_PATH']),
  nonEmpty,
);
if (Option.isSome(configuredUserDataPath)) {
  app.setPath('userData', configuredUserDataPath.value);
}
const configuredLegacyCliStatePath = Option.filter(
  // eslint-disable-next-line node/no-process-env -- Electron bootstrap boundary
  Option.fromUndefinedOr(process.env['BIBLE_LEGACY_CLI_STATE_PATH']),
  nonEmpty,
);

const writingsDbPath = (): string => {
  if (Option.isSome(configuredUserDataPath)) {
    return path.join(app.getPath('userData'), 'egw-paragraphs.db');
  }
  return path.join(app.getPath('home'), '.bible', 'egw-paragraphs.db');
};
const cliStateDbPath = (): string =>
  Option.getOrElse(configuredLegacyCliStatePath, () =>
    path.join(app.getPath('home'), '.bible', 'state.db'),
  );
const bibleDbPath = () => path.join(app.getPath('userData'), 'bible.db');
const topicsDbPath = () => path.join(app.getPath('userData'), 'topics.db');

ipcMain.handle('bible:file-select', async () => {
  const selected = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Bible library backup', extensions: ['json'] }],
  });
  if (selected.canceled) return [];
  return selected.filePaths.map((file) => ({
    name: path.basename(file),
    contents: new Uint8Array(readFileSync(file)),
  }));
});

ipcMain.handle(
  'bible:file-save',
  async (_event, options: { readonly suggestedName: string; readonly contents: Uint8Array }) => {
    const selected = await dialog.showSaveDialog({
      defaultPath: options.suggestedName,
      filters: [{ name: 'Bible library backup', extensions: ['json'] }],
    });
    if (selected.canceled) return;
    const filePath = Option.fromUndefinedOr(selected.filePath);
    if (Option.isNone(filePath)) return;
    writeFileSync(filePath.value, options.contents);
  },
);

let mainRuntime: Option.Option<MainRuntime> = Option.none();

const resolveWindowIcon = (): Option.Option<string> => {
  const candidates = [
    path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    path.join(process.resourcesPath, 'assets', 'icon.png'),
  ];
  for (const candidate of candidates) {
    const readable = Effect.runSync(Effect.option(Effect.try(() => readFileSync(candidate))));
    if (Option.isSome(readable)) return Option.some(candidate);
  }
  return Option.none();
};

const createWindow = async (runtime: MainRuntime): Promise<void> => {
  const icon = resolveWindowIcon();
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
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
  };
  if (Option.isSome(icon)) windowOptions.icon = icon.value;
  const win = new BrowserWindow(windowOptions);

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const { port1, port2 } = new MessageChannelMain();
  const procedurePort: DesktopProcedureServerPort = {
    subscribe: (listener) => {
      const onMessage = (event: Electron.MessageEvent): void => {
        listener(event.data);
      };
      port1.on('message', onMessage);
      return () => port1.off('message', onMessage);
    },
    onClose: (listener) => {
      port1.on('close', listener);
      return () => port1.off('close', listener);
    },
    send: (message) => port1.postMessage(message),
    start: () => port1.start(),
  };
  const procedureServer = runtime.runFork(Layer.launch(layerDesktopProcedureServer(procedurePort)));
  port1.once('close', () => {
    Effect.runFork(Fiber.interrupt(procedureServer));
  });
  win.webContents.once('did-finish-load', () => {
    win.webContents.postMessage('bible:procedure-port', DesktopProcedurePortMessage, [port2]);
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
  const bibleArtifacts = layerNativeBibleArtifacts({
    destination: bibleDbPath(),
    sources: [
      {
        kind: 'packaged',
        path: path.join(process.resourcesPath, 'data', 'bible.db'),
        label: 'packaged',
      },
      {
        kind: 'workspace',
        path: path.resolve(process.cwd(), '..', '..', 'packages', 'core', 'data', 'bible.db'),
        label: 'workspace',
      },
      {
        kind: 'runtime',
        path: path.join(app.getPath('home'), '.bible', 'bible.db'),
        label: 'runtime',
      },
      { kind: 'release', ...BIBLE_ARTIFACT_RELEASE },
    ],
  });
  // Topics reads the same three local slots Bible does, plus the release pin
  // once one is published. `layerNativeFileArtifacts` performs the atomic swap:
  // stream to `topics.db.building`, verify digest and semantics, then rename
  // over `userData/topics.db`. Any failure removes the building file and leaves
  // the active artifact untouched.
  const topicsArtifacts = layerNativeTopicsArtifacts({
    destination: topicsDbPath(),
    sources: [
      {
        kind: 'packaged',
        path: path.join(process.resourcesPath, 'data', 'topics.db'),
        label: 'packaged',
      },
      {
        kind: 'workspace',
        path: path.resolve(process.cwd(), '..', '..', 'packages', 'core', 'data', 'topics.db'),
        label: 'workspace',
      },
      {
        kind: 'runtime',
        path: path.join(app.getPath('home'), '.bible', 'topics.db'),
        label: 'runtime',
      },
      ...topicsReleaseSource(),
    ],
  });
  const corpusSupply = CorpusSupply.layer.pipe(
    Layer.provide(Layer.merge(bibleArtifacts, topicsArtifacts)),
  );
  const provisionedCorpus = await Effect.runPromise(
    Effect.gen(function* () {
      const supply = yield* CorpusSupply;
      return yield* supply.ensure();
    }).pipe(Effect.provide(corpusSupply)),
  );
  // Writings-style catch-and-warn (§3.5): topics never blocks startup.
  const topicsActivation = await Effect.runPromise(
    Effect.gen(function* () {
      const supply = yield* CorpusSupply;
      const receipt = yield* supply.ensure({ target: Target.topics() });
      return Option.fromUndefinedOr(
        receipt.activated.find((activation) => activation.corpus === 'topics'),
      );
    }).pipe(
      Effect.provide(corpusSupply),
      Effect.catch((cause) =>
        Effect.sync(() => {
          console.warn(`[main] topics-corpus-unavailable category=${failureCategory(cause)}`);
          return Option.none<CorpusActivation>();
        }),
      ),
    ),
  );
  console.info(
    `[main] topics-corpus-ready state=${Option.match(topicsActivation, {
      onNone: () => 'absent',
      onSome: () => 'activated',
    })}`,
  );
  const bibleActivation = Option.fromUndefinedOr(
    provisionedCorpus.activated.find((activation) => activation.corpus === 'bible'),
  );
  const activationState = Option.match(bibleActivation, {
    onNone: () => 'current',
    onSome: () => 'activated',
  });
  const activationSource = bibleActivation.pipe(
    Option.flatMap((activation) => Option.fromUndefinedOr(activation.source)),
    Option.getOrElse(() => 'current'),
  );
  const installedVerses = bibleActivation.pipe(
    Option.flatMap((activation) => Option.fromUndefinedOr(activation.installed)),
    Option.getOrElse(() => 31_102),
  );
  console.info(
    `[main] bible-corpus-ready state=${activationState} source=${activationSource} verses=${String(installedVerses)}`,
  );
  console.info(
    `[main] legacy-cli-source configured=${String(Option.isSome(configuredLegacyCliStatePath))}`,
  );
  const userState = await Effect.runPromise(
    prepareDesktopUserState({
      userDataPath: app.getPath('userData'),
      cliStateFile: cliStateDbPath(),
      writingsFile: writingsDbPath(),
      migrationSql: userStateMigrationSql,
      log: (line) => console.info(line),
    }),
  );
  console.info('[main] runtime-creating');
  const runtime = makeRuntime(writingsDbPath(), bibleDbPath(), userState.filename, {
    randomUuid: () => crypto.randomUUID(),
    nowIso: () => new Date().toISOString(),
  });
  mainRuntime = Option.some(runtime);

  // Construct every persistent module before opening a renderer. This runs
  // DDL/migrations now instead of making the first user operation pay for it.
  await runtime.runPromise(EGWParagraphDatabase.pipe(Effect.asVoid));
  await runtime.runPromise(BibleCorpus.pipe(Effect.asVoid));
  await runtime.runPromise(BibleDatabase.pipe(Effect.asVoid));
  console.info('[main] persistence-ready');

  void createWindow(runtime);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow(runtime);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', (event) => {
  const runtime = mainRuntime;
  if (Option.isNone(runtime)) return;
  event.preventDefault();
  mainRuntime = Option.none();
  void runtime.value.dispose().then(() => app.exit(0));
});
