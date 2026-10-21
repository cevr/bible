/**
 * The local preview as a resource: `bun run preview`'s server
 * (`../../src/worker/preview.ts`) started in a scratch root of its own, held
 * for a scope and stopped when the scope closes.
 *
 * The server reads `dist/` and writes its letters to `tmp/outbox/` from the
 * directory it runs in, so it runs with the root as its directory: the root
 * holds a link to the app's `dist/` (the build under test) and the run's own
 * outbox and log. Its environment is only `PATH`, `HOME`, `TMPDIR` and
 * `PORT`, and Bun finds no `.env` in the root, so no secret of the app's
 * reaches a run and its admin token is a fresh one.
 */
import {
  Config,
  DateTime,
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

const READY_WITHIN = '20 seconds';

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

/** Whether `origin` answers its home page with 200. */
export const answers = Effect.fn('Verify.answers')(function* (origin: string) {
  const client = yield* HttpClient.HttpClient;
  const response = yield* client.get(`${origin}/`).pipe(Effect.option);
  return Option.exists(response, (r) => r.status === 200);
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
  const handle = yield* spawner.spawn(
    ChildProcess.make('bun', [PREVIEW_ENTRY], {
      cwd: resolved,
      env,
      extendEnv: false,
      stdin: 'ignore',
      forceKillAfter: '5 seconds',
    }),
  );
  yield* Stream.run(handle.all, fs.sink(at.log)).pipe(Effect.ignore, Effect.forkScoped);
  const origin = `http://127.0.0.1:${port}`;
  yield* answers(origin).pipe(
    Effect.flatMap((ok) => {
      if (ok) return Effect.void;
      return Effect.fail(NotReady.make({ message: `${origin} does not answer yet` }));
    }),
    Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 200 }),
    Effect.mapError(() =>
      NotReady.make({ message: `${origin} did not answer within ${READY_WITHIN}; see ${at.log}` }),
    ),
  );
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
  const { out: command } = yield* run('ps', ['-o', 'command=', '-p', String(record.pid)]);
  const { out: cwd } = yield* run('lsof', ['-a', '-p', String(record.pid), '-d', 'cwd', '-Fn']);
  if (!command.includes('src/worker/preview.ts') || !cwd.includes(`n${record.root}`))
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
