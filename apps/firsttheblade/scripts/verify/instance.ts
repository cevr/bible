/**
 * The local preview as a resource: `bun run preview`'s server
 * (`../../src/worker/preview.ts`) started in a scratch root of its own, held
 * for a scope and stopped when the scope closes.
 *
 * The server reads `dist/` and writes its letters to `tmp/outbox/` from the
 * directory it runs in, so it runs with the root as its directory: the root
 * holds a link to the app's `dist/` (the build under test) and the run's own
 * outbox and log. Its environment is only `PATH`, `HOME`, `TMPDIR` and
 * `PORT`, and Bun reads no `.env` (`--no-env-file`), so no secret of the
 * app's reaches a run, even from a `.env` put in the root, and its admin
 * token is a fresh one. A root holds one preview at a time: its record is
 * how `stop` finds it.
 */
import {
  Config,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Option,
  Path,
  Schedule,
  Schema,
  Stream,
} from 'effect';
import { HttpClient } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { CommandFailed, LaunchRecord, NotBuilt, NotReady, Refused } from './model.ts';

/** The app's directory, `apps/firsttheblade`. */
export const APP_DIR = `${import.meta.dir}/../..`;

const PREVIEW_ENTRY = `${APP_DIR}/src/worker/preview.ts`;

/** `bun run preview`'s own port: the owner's preview, never driven. */
const OWNER_PORT = 8470;

/** How long the readiness wait gives each try, and the preview in all. */
export interface ReadyDeadlines {
  readonly each: Duration.Input;
  readonly within: Duration.Input;
}

const READY: ReadyDeadlines = { each: '1 second', within: '20 seconds' };

/** A command's whole output, and its exit code. */
export const run = Effect.fn('Verify.run')(function* (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string = APP_DIR,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const failed = (error: { readonly message: string }) =>
    CommandFailed.make({ command: [command, ...args].join(' '), message: error.message });
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, [...args], {
          cwd,
          stdin: 'ignore',
          forceKillAfter: '5 seconds',
        }),
      );
      const [out, code] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 2 },
      );
      return { out, code: Number(code) };
    }),
  ).pipe(Effect.mapError(failed));
});

/** The commit the checkout is at. */
export const headOf = Effect.fn('Verify.headOf')(function* () {
  const { out, code } = yield* run('git', ['rev-parse', 'HEAD']);
  if (code !== 0) return yield* CommandFailed.make({ command: 'git rev-parse HEAD', message: out });
  return out.trim();
});

/** The PIDs listening on `port`; none when the port is free. */
export const listenersOn = Effect.fn('Verify.listenersOn')(function* (port: number) {
  const { out } = yield* run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  return out
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(Number);
});

/** Whether `origin` answers its home page with 200 within `each`. */
export const answers = Effect.fn('Verify.answers')(function* (
  origin: string,
  each: Duration.Input,
) {
  const client = yield* HttpClient.HttpClient;
  const response = yield* client.get(`${origin}/`).pipe(Effect.timeout(each), Effect.option);
  return Option.exists(response, (r) => r.status === 200);
});

/**
 * Waits for `origin` to answer, each try and the whole wait under their own
 * deadline, and fails as `NotReady` once the wait runs out or the preview
 * exits (`exited`) before it answers.
 */
export const awaitReady = Effect.fn('Verify.awaitReady')(function* (
  origin: string,
  exited: Effect.Effect<unknown, unknown>,
  log: string,
  deadlines: ReadyDeadlines = READY,
) {
  const within = Duration.format(Duration.fromInputUnsafe(deadlines.within));
  const answered = answers(origin, deadlines.each).pipe(
    Effect.flatMap((ok) => {
      if (ok) return Effect.void;
      return Effect.fail(NotReady.make({ message: `${origin} does not answer yet` }));
    }),
    // The deadline is the timeout below; the count is a second bound, past it.
    Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 1000 }),
    Effect.timeout(deadlines.within),
    Effect.mapError(() =>
      NotReady.make({ message: `${origin} did not answer within ${within}; see ${log}` }),
    ),
  );
  const died = exited.pipe(
    Effect.option,
    Effect.flatMap((code) =>
      Effect.fail(
        NotReady.make({
          message: `the preview exited (${Option.getOrElse(code, () => 'no code')}) before ${origin} answered; see ${log}`,
        }),
      ),
    ),
  );
  yield* Effect.raceFirst(answered, died);
});

const paths = (root: string) => ({
  record: `${root}/launch.json`,
  dist: `${root}/dist`,
  outbox: `${root}/tmp/outbox`,
  log: `${root}/preview.log`,
});

/** The outbox a root's preview writes its letters to. */
export const outboxOf = (root: string) => paths(root).outbox;

const LaunchJson = Schema.fromJsonString(LaunchRecord);

/** The launch record a root holds, as `verify:launch` wrote it. */
export const readRecord = Effect.fn('Verify.readRecord')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs
    .readFileString(paths(root).record)
    .pipe(
      Effect.mapError(() =>
        NotReady.make({ message: `no launch record at ${paths(root).record}: run verify:launch` }),
      ),
    );
  return yield* Schema.decodeEffect(LaunchJson)(text).pipe(
    Effect.mapError((error) =>
      NotReady.make({ message: `launch record unreadable: ${error.message}` }),
    ),
  );
});

/** The preview's process: `entry` run by Bun in `root` with `env` alone. */
export const previewCommand = (
  entry: string,
  root: string,
  env: Readonly<Record<string, string>>,
) =>
  ChildProcess.make('bun', ['--no-env-file', entry], {
    cwd: root,
    env,
    extendEnv: false,
    stdin: 'ignore',
    forceKillAfter: '5 seconds',
  });

/** Whether `lsof -Fn` output names `root` as the directory. */
export const cwdIs = (lsof: string, root: string) => lsof.split('\n').includes(`n${root}`);

/** Whether the record's PID is a preview running in the record's root. */
const isPreviewOf = Effect.fn('Verify.isPreviewOf')(function* (record: LaunchRecord) {
  const { out: command } = yield* run('ps', ['-o', 'command=', '-p', String(record.pid)]);
  const { out: cwd } = yield* run('lsof', ['-a', '-p', String(record.pid), '-d', 'cwd', '-Fn']);
  return command.includes('src/worker/preview.ts') && cwdIs(cwd, record.root);
});

/** Refuses the owner's port and a port something already holds. */
const freePort = Effect.fn('Verify.freePort')(function* (port: number) {
  if (port === OWNER_PORT)
    return yield* Refused.make({
      message: `port ${OWNER_PORT} is the owner's own preview; pick another`,
    });
  const held = yield* listenersOn(port);
  if (held.length > 0)
    return yield* Refused.make({ message: `port ${port} is held by pid ${held.join(',')}` });
});

/** Refuses a root whose recorded preview still runs: its record is the only way to stop it. */
const freeRoot = Effect.fn('Verify.freeRoot')(function* (root: string) {
  const held = yield* readRecord(root).pipe(Effect.option);
  if (Option.isNone(held)) return;
  const { pid } = held.value;
  if (yield* isPreviewOf(held.value).pipe(Effect.orElseSucceed(() => false)))
    return yield* Refused.make({
      message: `${root} holds a running preview (pid ${pid}): run verify:stop --root ${root}, or pick another root`,
    });
});

/** The scratch root, made with its link to the app's build. */
const prepareRoot = Effect.fn('Verify.prepareRoot')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const built = path.join(APP_DIR, 'dist');
  if (!(yield* fs.exists(path.join(built, 'index.html'))))
    return yield* NotBuilt.make({ message: `no build at ${built}: run bun run build first` });
  const at = paths(root);
  yield* fs.makeDirectory(path.dirname(at.outbox), { recursive: true });
  if (yield* fs.exists(at.dist)) yield* fs.remove(at.dist);
  yield* fs.symlink(path.resolve(built), at.dist);
  // The real path, as `lsof` reports the server's directory (macOS's /tmp is /private/tmp).
  return yield* fs.realPath(root);
});

/**
 * The preview, launched in `root` on `port` and ready (its home page answers),
 * held while the scope is open and stopped when it closes. Its record is
 * written to `<root>/launch.json`. `exited` waits for the server to stop.
 */
export const launch = Effect.fn('Verify.launch')(function* (root: string, port: number) {
  yield* freeRoot(root);
  yield* freePort(port);
  const resolved = yield* prepareRoot(root);
  const at = paths(resolved);
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const env = {
    PATH: yield* Config.String('PATH'),
    HOME: yield* Config.String('HOME'),
    TMPDIR: yield* Config.String('TMPDIR').pipe(Config.withDefault('/tmp')),
    PORT: String(port),
  };
  const handle = yield* spawner.spawn(previewCommand(PREVIEW_ENTRY, resolved, env));
  yield* Stream.run(handle.all, fs.sink(at.log)).pipe(Effect.ignore, Effect.forkScoped);
  const origin = `http://127.0.0.1:${port}`;
  yield* awaitReady(origin, handle.exitCode, at.log);
  const record: LaunchRecord = {
    root: resolved,
    port,
    origin,
    pid: Number(handle.pid),
    head: yield* headOf(),
    dist: yield* fs.realPath(at.dist),
    outbox: at.outbox,
    log: at.log,
    startedAt: DateTime.formatIso(yield* DateTime.now),
  };
  yield* fs.writeFileString(at.record, yield* Schema.encodeEffect(LaunchJson)(record));
  return { record, exited: handle.exitCode };
});

/**
 * Stops a root's preview by the PID its record holds, once that PID is a
 * preview running in that root (a PID reused by another process is never
 * signalled), then waits for its port to be free.
 */
export const stop = Effect.fn('Verify.stop')(function* (root: string) {
  const record = yield* readRecord(root);
  if (!(yield* isPreviewOf(record)))
    return yield* Refused.make({
      message: `pid ${record.pid} is not the preview of ${record.root}; nothing stopped`,
    });
  const { code } = yield* run('kill', ['-TERM', String(record.pid)]);
  if (code !== 0) return yield* CommandFailed.make({ command: 'kill', message: `exit ${code}` });
  yield* listenersOn(record.port).pipe(
    Effect.flatMap((held) => {
      if (held.length === 0) return Effect.void;
      return Effect.fail(NotReady.make({ message: `port ${record.port} still held` }));
    }),
    Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 100 }),
  );
  return { stopped: record.pid, port: record.port, root: record.root };
});
