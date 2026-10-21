/**
 * The drive's steps, one per `sim.ts` command: boot a simulator (or a
 * headless browser) and a dev server, install the build, open a screen,
 * tap, scroll, shoot, read the log, and shut it all down.
 *
 * Separate commands share one drive through its session file, which `boot`
 * writes and `down` files away into the drive's output directory. The dev
 * server belongs to `serve`, a process of its own that `boot` starts and
 * leaves running: `serve` owns `one dev` in a scope, so stopping it (down's
 * SIGTERM) closes the scope and kills the server.
 */
import {
  Array as Arr,
  Clock,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
  Stream,
} from 'effect';
import { HttpClient } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import {
  HostFailed,
  NoSession,
  Unhealthy,
  NotOnPlatform,
  SimulatorDown,
  TargetMissing,
  ToolFailed,
} from './errors.ts';
import { type Platform, Session } from './result.ts';
import { attempt, ready, succeed } from './tools.ts';

/** The simulator `sim.ts` creates, boots and shuts down; never another. */
export const SIMULATOR = 'verify-hymnal';
/** The device type a new `verify-hymnal` simulator takes. */
const DEVICE_TYPE = 'iPhone 18 Pro';
const BUNDLE_ID = 'im.cvr.hymnal';
/** The URL scheme `install` registers in the built app, so a deep link opens a route. */
export const SCHEME = 'hymnal';
/** The drivers' session name, for agent-device and agent-browser alike. */
const DRIVER_SESSION = 'verify-hymnal';

const short = Duration.seconds(30);
const build = Duration.minutes(45);

/** Where a drive lives: the app's folder, the state folder and this script. */
export interface Place {
  readonly app: string;
  readonly state: string;
  readonly script: string;
}

/** What a step reports: the files it wrote and what it saw. */
export interface Outcome {
  readonly platform: Platform;
  readonly paths: Record<string, string>;
  readonly detail: Record<string, string | number | boolean>;
}

const outcome = (
  platform: Platform,
  paths: Record<string, string>,
  detail: Record<string, string | number | boolean>,
): Outcome => ({ platform, paths, detail });

// ---------------------------------------------------------------------------
// The session.

const SessionJson = Schema.fromJsonString(Session);

const sessionFile = (place: Place) => `${place.state}/session.json`;

/** The booted drive, or `NoSession`. */
export const readSession = Effect.fn('Sim.readSession')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const file = sessionFile(place);
  const text = yield* fs.readFileString(file).pipe(Effect.mapError(() => NoSession.make({ file })));
  return yield* Schema.decodeEffect(SessionJson)(text).pipe(
    Effect.mapError(() => NoSession.make({ file })),
  );
});

const writeSession = Effect.fn('Sim.writeSession')(function* (place: Place, session: Session) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(place.state, { recursive: true });
  const text = yield* Schema.encodeEffect(SessionJson)(session).pipe(
    Effect.mapError((error) => HostFailed.make({ reason: error.message })),
  );
  yield* fs.writeFileString(sessionFile(place), text);
});

// ---------------------------------------------------------------------------
// The simulator.

const Device = Schema.Struct({ name: Schema.String, udid: Schema.String, state: Schema.String });
const DeviceList = Schema.fromJsonString(
  Schema.Struct({ devices: Schema.Record(Schema.String, Schema.Array(Device)) }),
);
const RuntimeList = Schema.fromJsonString(
  Schema.Struct({
    runtimes: Schema.Array(
      Schema.Struct({ identifier: Schema.String, isAvailable: Schema.Boolean }),
    ),
  }),
);

const decodeTool = <A>(schema: Schema.Codec<A, string>, tool: string, text: string) =>
  Schema.decodeEffect(schema)(text).pipe(
    Effect.mapError((error) =>
      ToolFailed.make({
        tool,
        args: [],
        exitCode: 0,
        output: `unreadable output: ${error.message}`,
      }),
    ),
  );

/** Every simulator device, from `simctl list`. */
const devices = Effect.gen(function* () {
  const text = yield* succeed('xcrun', ['simctl', 'list', 'devices', '-j'], short);
  const list = yield* decodeTool(DeviceList, 'xcrun simctl list devices', text);
  return Object.values(list.devices).flat();
});

const named = (name: string) =>
  Effect.map(devices, (all) => Option.fromNullishOr(all.find((device) => device.name === name)));

/** The newest available iOS runtime. */
const runtime = Effect.gen(function* () {
  const text = yield* succeed('xcrun', ['simctl', 'list', 'runtimes', '-j'], short);
  const list = yield* decodeTool(RuntimeList, 'xcrun simctl list runtimes', text);
  const ios = list.runtimes.filter(
    (entry) => entry.isAvailable && entry.identifier.includes('.iOS-'),
  );
  const newest = Arr.last(ios);
  if (Option.isNone(newest))
    return yield* ToolFailed.make({
      tool: 'xcrun simctl list runtimes',
      args: [],
      exitCode: 0,
      output: 'no available iOS runtime',
    });
  return newest.value.identifier;
});

/** The `verify-hymnal` simulator's UDID, created when it is missing. */
const simulator = Effect.gen(function* () {
  const found = yield* named(SIMULATOR);
  if (Option.isSome(found)) return found.value.udid;
  const id = yield* runtime;
  const udid = yield* succeed('xcrun', ['simctl', 'create', SIMULATOR, DEVICE_TYPE, id], short);
  return udid.trim();
});

/** The drive's simulator is booted, or the step fails as `SimulatorDown`. */
const booted = Effect.fn('Sim.booted')(function* (session: Session) {
  const all = yield* devices;
  const device = all.find((entry) => entry.udid === session.udid);
  const state = device?.state ?? 'missing';
  if (state !== 'Booted') return yield* SimulatorDown.make({ name: SIMULATOR, state });
  return session.udid;
});

const bootSimulator = Effect.fn('Sim.bootSimulator')(function* (port: number, seconds: number) {
  const udid = yield* simulator;
  const all = yield* devices;
  const state = all.find((entry) => entry.udid === udid)?.state ?? 'missing';
  if (state !== 'Booted') yield* succeed('xcrun', ['simctl', 'boot', udid], short);
  yield* succeed('xcrun', ['simctl', 'bootstatus', udid, '-b'], Duration.seconds(seconds));
  // A Debug build asks this host:port for its bundle (RCTBundleURLProvider's `RCT_jsLocation`).
  yield* succeed(
    'xcrun',
    [
      'simctl',
      'spawn',
      udid,
      'defaults',
      'write',
      BUNDLE_ID,
      'RCT_jsLocation',
      `127.0.0.1:${port}`,
    ],
    short,
  );
  return udid;
});

// ---------------------------------------------------------------------------
// The dev server.

const answers = (port: number) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(`http://127.0.0.1:${port}/`);
    if (response.status >= 500) return yield* Effect.fail(`status ${response.status}`);
    return response.status;
  }).pipe(Effect.timeout('5 seconds'));

/**
 * `serve`: run `one dev` on `port` until this process is stopped, its output
 * into `<out>/server.log`. The server is acquired in this scope and killed
 * when it closes, whether the server exits, the process is interrupted or
 * stopped.
 */
export const serve = Effect.fn('Sim.serve')(function* (place: Place, port: number, out: string) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* fs.makeDirectory(out, { recursive: true });
  const args = ['dev', '--port', String(port), '--host', '127.0.0.1'];
  // vxrn's orphan check ends `one dev` once its parent's parent is launchd,
  // as `serve`'s is: a shell between them is that parent, and `serve` its.
  const server = yield* Effect.acquireRelease(
    spawner.spawn(
      ChildProcess.make(
        '/bin/sh',
        ['-c', '"$0" "$@"; exit $?', `${place.app}/node_modules/.bin/one`, ...args],
        {
          cwd: place.app,
          forceKillAfter: '5 seconds',
        },
      ),
    ),
    (handle) => Effect.ignore(handle.kill({ killSignal: 'SIGTERM', forceKillAfter: '5 seconds' })),
  );
  const log = `${out}/server.log`;
  const [, , exitCode] = yield* Effect.all(
    [
      Stream.run(server.stdout, fs.sink(log)),
      Stream.run(server.stderr, fs.sink(`${out}/server.err.log`)),
      server.exitCode,
    ],
    { concurrency: 3 },
  );
  return yield* ToolFailed.make({ tool: 'one', args, exitCode, output: `exited; see ${log}` });
}, Effect.scoped);

/**
 * Start `serve` as a process of its own, left running past this command; its
 * pid. A shell starts it in the background and exits, so `serve` outlives
 * this command's runtime, which ends the children it spawned itself.
 */
const startServer = Effect.fn('Sim.startServer')(function* (
  place: Place,
  port: number,
  out: string,
) {
  const args = [
    place.script,
    'serve',
    '--port',
    String(port),
    '--out',
    out,
    '--state',
    place.state,
  ];
  const background = 'nohup "$0" "$@" >/dev/null 2>&1 & echo $!';
  const pid = yield* succeed('/bin/sh', ['-c', background, 'bun', ...args], short);
  const parsed = Number.parseInt(pid.trim(), 10);
  if (!Number.isInteger(parsed))
    return yield* ToolFailed.make({ tool: '/bin/sh', args, exitCode: 0, output: `no pid: ${pid}` });
  return parsed;
});

/** The server process is gone, or still there after the wait. */
const gone = (pid: number) =>
  Effect.gen(function* () {
    const alive = yield* attempt('kill', ['-0', String(pid)], short);
    if (alive.exitCode === 0) return yield* Effect.fail('running');
  });

/** Stop `serve` (SIGTERM closes its scope, which kills `one dev`); SIGKILL if it outlasts the wait. */
const stopServer = Effect.fn('Sim.stopServer')(function* (pid: number) {
  yield* attempt('kill', ['-TERM', String(pid)], short);
  yield* ready('the dev server to stop', 15, gone(pid)).pipe(
    Effect.catchTag('ReadinessTimedOut', (error) =>
      Effect.andThen(attempt('kill', ['-KILL', String(pid)], short), Effect.fail(error)),
    ),
  );
});

const serverUp = Effect.fn('Sim.serverUp')(function* (
  place: Place,
  port: number,
  out: string,
  seconds: number,
) {
  const taken = yield* Effect.isSuccess(answers(port));
  if (taken)
    return yield* ToolFailed.make({
      tool: 'one',
      args: ['dev', '--port', String(port)],
      exitCode: -1,
      output: `port ${port} already answers; pick another of 8270-8279`,
    });
  const pid = yield* startServer(place, port, out);
  yield* ready(`the dev server on port ${port}`, seconds, answers(port)).pipe(
    Effect.onError(() => Effect.ignore(stopServer(pid))),
  );
  return pid;
});

// ---------------------------------------------------------------------------
// Targets: an accessibility id or label.

interface Target {
  readonly by: 'id' | 'label';
  readonly value: string;
}

/** `id=<testID>` or `label=<accessibility label>`; a bare word is a label. */
export const parseTarget = (text: string): Target => {
  const unquote = (value: string) => value.replace(/^"(.*)"$/s, '$1');
  if (text.startsWith('id=')) return { by: 'id', value: unquote(text.slice(3)) };
  if (text.startsWith('label=')) return { by: 'label', value: unquote(text.slice(6)) };
  return { by: 'label', value: text };
};

/** A double-quoted selector value, its quotes and backslashes escaped. */
const quoted = (value: string) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** agent-device's selector for the target. */
const iosSelector = (target: Target) => `${target.by}=${quoted(target.value)}`;

/** The CSS selector react-native-web renders the target as. */
const webSelector = (target: Target) => {
  if (target.by === 'id') return `[data-testid=${quoted(target.value)}]`;
  return `[aria-label=${quoted(target.value)}]`;
};

const device = (args: ReadonlyArray<string>, limit = short) =>
  succeed('agent-device', [...args, '--session', DRIVER_SESSION], limit);
/** The browser's launch flags: a drive never plays sound through the host's speakers. */
const MUTED = '--mute-audio,--disable-audio-output';
const browser = (args: ReadonlyArray<string>, limit = short) =>
  succeed('agent-browser', ['--session', DRIVER_SESSION, ...args], limit);

/** A driver's failed wait for `text`, as `TargetMissing` with what the driver said. */
const missingFrom = (session: Session, text: string) => (failed: ToolFailed) =>
  Effect.fail(
    TargetMissing.make({ target: text, platform: session.platform, driver: failed.output }),
  );

/** The target is on screen within `seconds`, or the step fails as `TargetMissing`. */
const present = Effect.fn('Sim.present')(function* (
  session: Session,
  text: string,
  seconds: number,
) {
  const target = parseTarget(text);
  const missing = missingFrom(session, text);
  const ms = String(Math.round(seconds * 1000));
  if (session.platform === 'ios')
    return yield* device(['wait', iosSelector(target), ms], Duration.seconds(seconds + 10)).pipe(
      Effect.catchTag('ToolFailed', missing),
    );
  return yield* browser(
    ['wait', webSelector(target), '--timeout', ms],
    Duration.seconds(seconds + 10),
  ).pipe(Effect.catchTag('ToolFailed', missing));
});

// ---------------------------------------------------------------------------
// The steps.

export interface BootOptions {
  readonly platform: Platform;
  readonly port: number;
  readonly out: Option.Option<string>;
  readonly seconds: number;
}

const stamp = Effect.map(DateTime.now, (now) => DateTime.formatIso(now));

export const boot = Effect.fn('Sim.boot')(function* (place: Place, options: BootOptions) {
  const path = yield* Path.Path;
  const bootedAt = yield* stamp;
  const out = Option.getOrElse(options.out, () =>
    path.join(place.state, bootedAt.replaceAll(':', '-')),
  );
  const udid = yield* bootSimulatorFor(options);
  const serverPid = yield* serverUp(place, options.port, out, options.seconds);
  const session: Session = {
    platform: options.platform,
    out,
    port: options.port,
    serverPid,
    udid,
    bootedAt,
  };
  yield* writeSession(place, session);
  if (options.platform === 'web')
    yield* browser(
      ['--args', MUTED, 'open', `http://127.0.0.1:${options.port}/`],
      Duration.seconds(options.seconds),
    );
  return outcome(
    options.platform,
    { session: sessionFile(place), out, server: `${out}/server.log` },
    { udid, port: options.port, serverPid },
  );
});

const bootSimulatorFor = (options: BootOptions) => {
  if (options.platform === 'web') return Effect.succeed('');
  return bootSimulator(options.port, options.seconds);
};

/** The plist `install` edits so the app answers `hymnal://` links. */
const plist = (place: Place) => `${place.app}/ios/Hymnal/Info.plist`;
const PLIST_BUDDY = '/usr/libexec/PlistBuddy';

const registerScheme = Effect.fn('Sim.registerScheme')(function* (file: string) {
  const read = yield* attempt(
    PLIST_BUDDY,
    ['-c', 'Print :CFBundleURLTypes:0:CFBundleURLSchemes:0', file],
    short,
  );
  if (read.exitCode === 0 && read.output.trim() === SCHEME) return false;
  yield* succeed(
    PLIST_BUDDY,
    [
      '-c',
      'Add :CFBundleURLTypes array',
      '-c',
      'Add :CFBundleURLTypes:0 dict',
      '-c',
      'Add :CFBundleURLTypes:0:CFBundleURLSchemes array',
      '-c',
      `Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ${SCHEME}`,
      file,
    ],
    short,
  );
  return true;
});

/**
 * Build the checkout's Debug simulator app; its path. It prebuilds first
 * when `ios/` is missing or `prebuild` asks: `ios/build/generated` holds the
 * codegen pod install wrote, so an `ios/` whose `build/` was removed needs
 * one too.
 */
const buildApp = Effect.fn('Sim.buildApp')(function* (
  place: Place,
  out: string,
  prebuild: boolean,
) {
  const fs = yield* FileSystem.FileSystem;
  const ios = `${place.app}/ios`;
  const hasIos = yield* fs.exists(`${ios}/Hymnal.xcworkspace`);
  if (prebuild || !hasIos)
    yield* succeed('bun', ['run', '--cwd', place.app, 'prebuild:native'], Duration.minutes(5));
  const registered = yield* registerScheme(plist(place));
  const args = [
    '-workspace',
    `${ios}/Hymnal.xcworkspace`,
    '-scheme',
    'Hymnal',
    '-configuration',
    'Debug',
    '-destination',
    'generic/platform=iOS Simulator',
    '-derivedDataPath',
    `${ios}/build/dd`,
    'SKIP_BUNDLING=1',
    // One architecture: a universal simulator build is twice the disk.
    'ARCHS=arm64',
    'ONLY_ACTIVE_ARCH=YES',
    'build',
  ];
  const built = yield* attempt('xcodebuild', args, build);
  yield* fs.writeFileString(`${out}/build.log`, built.output);
  if (built.exitCode !== 0)
    return yield* ToolFailed.make({
      tool: 'xcodebuild',
      args,
      exitCode: built.exitCode,
      output: `see ${out}/build.log`,
    });
  return { app: `${ios}/build/dd/Build/Products/Debug-iphonesimulator/Hymnal.app`, registered };
});

/**
 * A built app given to `install`, copied into the drive's output with the
 * scheme registered and the copy signed again (ad hoc, as a simulator build
 * is): the given app is left as it is.
 */
const copyApp = Effect.fn('Sim.copyApp')(function* (given: string, out: string) {
  const fs = yield* FileSystem.FileSystem;
  const app = `${out}/Hymnal.app`;
  yield* fs.makeDirectory(out, { recursive: true });
  yield* fs.copy(given, app, { overwrite: true });
  const registered = yield* registerScheme(`${app}/Info.plist`);
  yield* succeed(
    'codesign',
    ['--force', '--sign', '-', '--preserve-metadata=entitlements', app],
    Duration.minutes(2),
  );
  return { app, registered };
});

export interface InstallOptions {
  /** A built app to install instead of building this checkout. */
  readonly app: Option.Option<string>;
  /** Run `one prebuild` before the build. */
  readonly prebuild: boolean;
  /** A target that shows once the app has drawn. */
  readonly expect: string;
  readonly seconds: number;
}

export const install = Effect.fn('Sim.install')(function* (place: Place, options: InstallOptions) {
  const { app, expect, seconds } = options;
  const session = yield* readSession(place);
  if (session.platform === 'web')
    return yield* NotOnPlatform.make({ command: 'install', platform: 'web' });
  const udid = yield* booted(session);
  const started = yield* Clock.currentTimeMillis;
  const made = yield* Option.match(app, {
    onSome: (given) => copyApp(given, session.out),
    onNone: () => buildApp(place, session.out, options.prebuild),
  });
  const builtMs = (yield* Clock.currentTimeMillis) - started;
  yield* succeed('xcrun', ['simctl', 'install', udid, made.app], Duration.minutes(2));
  yield* device(
    ['open', BUNDLE_ID, '--platform', 'ios', '--udid', udid, '--relaunch'],
    Duration.seconds(seconds),
  );
  yield* present(session, expect, seconds);
  return outcome(
    'ios',
    { app: made.app, build: `${session.out}/build.log` },
    { udid, buildMs: builtMs, schemeAdded: made.registered, expect },
  );
});

/** A deep link as each platform opens it: `hymnal://<path>` on iOS, the route on the web. */
export const linkFor = (platform: Platform, port: number, link: string) => {
  const route = link.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\//, '');
  if (platform === 'ios') return `${SCHEME}://${route}`;
  return `http://127.0.0.1:${port}/${route}`;
};

export const open = Effect.fn('Sim.open')(function* (
  place: Place,
  link: string,
  expect: Option.Option<string>,
  seconds: number,
) {
  const session = yield* readSession(place);
  const url = linkFor(session.platform, session.port, link);
  if (session.platform === 'ios') {
    const udid = yield* booted(session);
    yield* succeed('xcrun', ['simctl', 'openurl', udid, url], short);
  } else yield* browser(['open', url], Duration.seconds(seconds));
  if (Option.isSome(expect)) yield* present(session, expect.value, seconds);
  return outcome(session.platform, {}, { url, expect: Option.getOrElse(expect, () => '') });
});

export const tap = Effect.fn('Sim.tap')(function* (place: Place, text: string, seconds: number) {
  const session = yield* readSession(place);
  if (session.platform === 'ios') yield* booted(session);
  yield* present(session, text, seconds);
  const target = parseTarget(text);
  if (session.platform === 'ios') yield* device(['press', iosSelector(target), '--settle']);
  else yield* browser(['click', webSelector(target)]);
  return outcome(session.platform, {}, { target: text });
});

export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** A step in each direction, as `scrollBy(x, y)` takes it. */
const STEP: Record<Direction, readonly [number, number]> = {
  up: [0, -600],
  down: [0, 600],
  left: [-600, 0],
  right: [600, 0],
};

/**
 * The page script that scrolls the screen one step: react-native-web's
 * ScrollView is a div of its own, so the window never scrolls; the tallest
 * element that can scroll is the screen's.
 */
const scrollScript = (direction: Direction) => {
  const [x, y] = STEP[direction];
  return [
    '(() => {',
    "  const all = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth)",
    '    .filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY + getComputedStyle(e).overflowX));',
    '  const screen = all.sort((a, b) => b.clientHeight - a.clientHeight)[0] ?? document.scrollingElement;',
    `  screen.scrollBy(${x}, ${y});`,
    '  return screen.scrollTop;',
    '})()',
  ].join('\n');
};

/**
 * Scroll the screen one step in `direction` (target `screen`), or until the
 * target shows: on iOS by scrolling `direction` until it does, on the web by
 * scrolling it into view.
 */
export const scroll = Effect.fn('Sim.scroll')(function* (
  place: Place,
  text: string,
  direction: Direction,
  seconds: number,
) {
  const session = yield* readSession(place);
  if (session.platform === 'ios') yield* booted(session);
  if (text === 'screen') {
    if (session.platform === 'ios') yield* device(['scroll', direction, '--settle']);
    else yield* browser(['eval', scrollScript(direction)]);
    return outcome(session.platform, {}, { target: text, direction });
  }
  const target = parseTarget(text);
  if (session.platform === 'ios')
    yield* device(
      ['scroll', direction, '--until', iosSelector(target)],
      Duration.seconds(seconds + 30),
    ).pipe(Effect.catchTag('ToolFailed', missingFrom(session, text)));
  else {
    yield* present(session, text, seconds);
    yield* browser(['scrollintoview', webSelector(target)]);
  }
  return outcome(session.platform, {}, { target: text, direction });
});

export const shot = Effect.fn('Sim.shot')(function* (place: Place, name: Option.Option<string>) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  const dir = `${session.out}/shots`;
  yield* fs.makeDirectory(dir, { recursive: true });
  const taken = yield* fs.readDirectory(dir);
  const file = `${dir}/${Option.getOrElse(name, () => `shot-${taken.length + 1}`)}.png`;
  if (session.platform === 'ios') {
    const udid = yield* booted(session);
    yield* succeed('xcrun', ['simctl', 'io', udid, 'screenshot', file], short);
  } else yield* browser(['screenshot', file]);
  return outcome(session.platform, { shot: file }, {});
});

/** Save the screen's accessibility tree as text under `<out>/snapshots`: what a step left on screen, by role and name. */
export const snapshot = Effect.fn('Sim.snapshot')(function* (
  place: Place,
  name: Option.Option<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  const dir = `${session.out}/snapshots`;
  yield* fs.makeDirectory(dir, { recursive: true });
  const taken = yield* fs.readDirectory(dir);
  const file = `${dir}/${Option.getOrElse(name, () => `snapshot-${taken.length + 1}`)}.txt`;
  if (session.platform === 'ios') yield* booted(session);
  const tree = yield* { ios: device, web: browser }[session.platform](['snapshot']);
  yield* fs.writeFileString(file, tree);
  return outcome(session.platform, { snapshot: file }, { lines: lines(tree) });
});

/** What `record` does: start a video, or stop and save it. */
export const RECORD = ['start', 'stop'] as const;

/**
 * Record the screen: `start` begins `<out>/video/<name>.mp4` (the
 * simulator) or `.webm` (the browser) through the driver, `stop` saves it.
 * The browser starts muted, so its video has no sound.
 */
export const record = Effect.fn('Sim.record')(function* (
  place: Place,
  action: (typeof RECORD)[number],
  name: Option.Option<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  if (session.platform === 'ios') yield* booted(session);
  const run = { ios: device, web: browser }[session.platform];
  if (action === 'stop') {
    yield* run(['record', 'stop'], Duration.minutes(2));
    return outcome(session.platform, {}, { action });
  }
  const dir = `${session.out}/video`;
  yield* fs.makeDirectory(dir, { recursive: true });
  const extension = { ios: 'mp4', web: 'webm' }[session.platform];
  const file = `${dir}/${Option.getOrElse(name, () => 'journey')}.${extension}`;
  yield* run(['record', 'start', file]);
  return outcome(session.platform, { video: file }, { action });
});

/** The app log's file name: the simulator's unified log, or the page's console. */
const LOG_NAME: Record<Platform, string> = { ios: 'app', web: 'console' };

const lines = (text: string) => text.split('\n').filter((line) => line.length > 0).length;

export const log = Effect.fn('Sim.log')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  const file = `${session.out}/${LOG_NAME[session.platform]}.log`;
  const text = yield* appLog(session);
  yield* fs.writeFileString(file, text);
  return outcome(
    session.platform,
    { log: file, server: `${session.out}/server.log` },
    { lines: lines(text) },
  );
});

/** The app's log since boot: the simulator's unified log for Hymnal, or the page's console. */
const appLog = Effect.fn('Sim.appLog')(function* (session: Session) {
  if (session.platform === 'web') return yield* browser(['console']);
  const udid = yield* booted(session);
  const now = yield* DateTime.now;
  const start = DateTime.makeUnsafe(session.bootedAt);
  const since = Math.max(1, Math.ceil(Duration.toSeconds(DateTime.distance(start, now))));
  return yield* succeed(
    'xcrun',
    [
      'simctl',
      'spawn',
      udid,
      'log',
      'show',
      '--style',
      'compact',
      '--last',
      `${since}s`,
      '--predicate',
      'process == "Hymnal"',
    ],
    Duration.minutes(2),
  );
});

export const down = Effect.fn('Sim.down')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  if (session.platform === 'ios') {
    yield* Effect.ignore(attempt('agent-device', ['close', '--session', DRIVER_SESSION], short));
    yield* Effect.ignore(attempt('xcrun', ['simctl', 'shutdown', session.udid], short));
  } else
    yield* Effect.ignore(attempt('agent-browser', ['--session', DRIVER_SESSION, 'close'], short));
  yield* stopServer(session.serverPid);
  yield* fs.makeDirectory(session.out, { recursive: true });
  const kept = `${session.out}/session.json`;
  yield* fs.rename(sessionFile(place), kept);
  return outcome(session.platform, { session: kept }, { serverPid: session.serverPid });
});

// ---------------------------------------------------------------------------
// The doctor: is this drive worth driving?

/** The parent of `pid`, or none once the chain ends. */
const parentOf = (pid: number) =>
  Effect.map(attempt('ps', ['-o', 'ppid=', '-p', String(pid)], short), (done) => {
    const parent = Number.parseInt(done.output.trim(), 10);
    return Option.liftPredicate(parent, (ppid) => done.exitCode === 0 && ppid > 1);
  });

/** `pid` is `ancestor` or runs under it. */
const descends = Effect.fn('Sim.descends')(function* (pid: number, ancestor: number) {
  let at = Option.some(pid);
  while (Option.isSome(at)) {
    if (at.value === ancestor) return true;
    at = yield* parentOf(at.value);
  }
  return false;
});

/** Lines of the dev server's log that report a failed request or build. */
const FAILURE = /\b(error|failed|5\d\d)\b/i;

/**
 * Read-only checks of the booted drive, in order; the first that fails is
 * the result (`Unhealthy` names it). Load above the core count fails
 * nothing, but `timingsHold` says no timing of this drive claims anything.
 */
export const doctor = Effect.fn('Sim.doctor')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  const sick = (check: string, reason: string) => Effect.fail(Unhealthy.make({ check, reason }));
  const alive = yield* attempt('kill', ['-0', String(session.serverPid)], short);
  if (alive.exitCode !== 0)
    return yield* sick('server-pid', `sim serve (pid ${session.serverPid}) is not running`);
  const listening = yield* attempt(
    'lsof',
    ['-nP', `-iTCP:${session.port}`, '-sTCP:LISTEN', '-t'],
    short,
  );
  const listeners = listening.output
    .split('\n')
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => !Number.isNaN(pid));
  const ours = yield* Effect.forEach(listeners, (pid) => descends(pid, session.serverPid));
  if (!ours.includes(true))
    return yield* sick(
      'port-owner',
      `port ${session.port} is held by ${listeners.join(', ') || 'nothing'}, not by sim serve (pid ${session.serverPid})`,
    );
  const status = yield* Effect.option(answers(session.port));
  if (Option.isNone(status))
    return yield* sick('server-answers', `http://127.0.0.1:${session.port}/ does not answer`);
  if (session.platform === 'ios') yield* booted(session);
  const server = `${session.out}/server.log`;
  const serverText = yield* fs.readFileString(server);
  const failures = serverText.split('\n').filter((line) => FAILURE.test(line));
  if (failures.length > 0)
    return yield* sick(
      'server-log',
      `${server} reports ${failures.length} failures, first: ${failures[0]}`,
    );
  const head = yield* succeed('git', ['-C', place.app, 'rev-parse', 'HEAD'], short);
  const audio = yield* attempt('pmset', ['-g', 'assertions'], short);
  const audioHolders = audio.output.split('\n').filter((line) => line.includes('audio-out')).length;
  const load = yield* succeed('sysctl', ['-n', 'vm.loadavg'], short);
  const cores = yield* succeed('sysctl', ['-n', 'hw.ncpu'], short);
  const load1 = Number.parseFloat(load.replace(/[{}]/g, '').trim().split(/\s+/)[0] ?? 'NaN');
  const ncpu = Number.parseInt(cores.trim(), 10);
  return outcome(
    session.platform,
    { server },
    {
      head: head.trim(),
      port: session.port,
      serverPid: session.serverPid,
      udid: session.udid,
      audioHolders,
      load: load1,
      cores: ncpu,
      timingsHold: load1 < ncpu,
    },
  );
});
