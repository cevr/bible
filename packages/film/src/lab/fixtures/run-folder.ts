// The folder one e2e run keeps its fixture bundles and its workers' Chrome
// profiles in (`film-test-bundles-*`, `run-suite.ts`), made for the run and
// removed once it ends. Another process can still change it as the run ends
// (a worker's Chrome or its helpers, `--user-data-dir=<folder>/chrome/<pid>`,
// shutting down). Bun's recursive remove (1.4.3) cannot share the folder: an
// entry gone under it while it walks fails it, NotFound, naming the folder,
// and with `force` it returns with the folder still there. So the release
// first ends every process whose command line names a path in the folder and
// waits until none runs, and only then removes the folder.

import { Effect, FileSystem, Option, Schedule, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** How often the release asks again whether the folder's processes have ended. */
const ASK_AGAIN = '50 millis';
/** How long a process asked to end (SIGTERM) has before it is killed (SIGKILL). */
const GRACE = '5 seconds';

/**
 * The processes of `ps` (`pid command` a line) whose command line names a
 * path in `folder` (`<folder>/…`), this process left out.
 */
export const namingFolder = (ps: string, folder: string, self: number): ReadonlyArray<number> =>
  ps.split('\n').flatMap((line) =>
    Option.toArray(
      Option.filter(
        Option.map(Option.fromNullishOr(/^\s*(\d+)\s+(.*)$/.exec(line)), (m) => ({
          pid: Number(m[1]),
          command: m[2] ?? '',
        })),
        (p) => p.pid !== self && p.command.includes(`${folder}/`),
      ).pipe(Option.map((p) => p.pid)),
    ),
  );

/** The host's processes, as `ps` lists them: `pid command` a line. */
const processes = Effect.scoped(
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make('ps', ['-A', '-o', 'pid=', '-o', 'command='], {
        stderr: 'ignore',
        forceKillAfter: '5 seconds',
      }),
    );
    return yield* child.stdout.pipe(Stream.decodeText(), Stream.mkString);
  }),
);

/** The processes, this one left out, whose command line names a path in `folder`. */
export const namingProcesses = (folder: string) =>
  Effect.map(processes, (ps) => namingFolder(ps, folder, process.pid));

/** Send `signal` to each of `pids`; one already gone is passed over. */
const signal = (pids: ReadonlyArray<number>, sig: NodeJS.Signals) =>
  Effect.forEach(pids, (pid) => Effect.ignore(Effect.try(() => process.kill(pid, sig))), {
    discard: true,
  });

/**
 * End the processes that name a path in `folder`, and wait until none runs:
 * each asked to end, and killed if it still runs after GRACE.
 */
const endProcessesIn = (folder: string) =>
  Effect.gen(function* () {
    const running = namingProcesses(folder);
    const ended = Effect.repeat(running, {
      schedule: Schedule.spaced(ASK_AGAIN),
      until: (pids) => pids.length === 0,
    });
    yield* signal(yield* running, 'SIGTERM');
    const inTime = yield* Effect.timeoutOption(ended, GRACE);
    if (Option.isSome(inTime)) return;
    yield* signal(yield* running, 'SIGKILL');
    yield* ended;
  });

/** A folder of the run's own under the temp folder, `prefix` its name's start; released as above. */
export const runFolder = (prefix: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.acquireRelease(fs.makeTempDirectory({ prefix }), (folder) =>
      Effect.orDie(Effect.andThen(endProcessesIn(folder), fs.remove(folder, { recursive: true }))),
    );
  });
