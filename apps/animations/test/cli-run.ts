// The app's CLI as the tests run it, over the fixture film, and how long a
// test that does may take.
//
// These tests spawn the CLI because their subject is the CLI as it is run:
// argv parsing, what it prints and its exit code. They run it over the
// fixture films (`fixtures/cli.ts`), never over a real film. A spawn is a
// cold Bun start plus the film's modules, so its time is the machine's, not
// the test's: measured on the owner's M-series Mac (12 cores), 0.57–0.75 s
// idle, 0.76–0.98 s inside the repo gate, and once over 5 s (bun's default
// test timeout) while sibling renders loaded every core. So a test that
// spawns declares its budget as spawns × SPAWN_MS, ten times the gate median:
// it still fails a CLI that hangs, and no longer fails a loaded machine.

import { Effect, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** The time one CLI spawn may take, in milliseconds (see above). */
export const SPAWN_MS = 10_000;

/** The timeout of a test that spawns the CLI `spawns` times and waits `extraMs` besides. */
export const spawnBudget = (spawns: number, extraMs = 0) => spawns * SPAWN_MS + extraMs;

/** The fixture CLI's entry, from the app folder. */
export const FIXTURE_CLI = 'test/fixtures/cli.ts';

/** The fixture film (`fixtures/films/tiny`): three short beats, a score, and procedural room tone and effects. */
export const FIXTURE_FILM = 'tiny';

const text = (stream: Stream.Stream<Uint8Array, unknown>) =>
  Stream.mkString(Stream.decodeText(stream));

/** The app folder, where `cli.ts` is. */
export const appDir = Effect.map(Path.Path, (path) => path.join(import.meta.dir, '..'));

/** The fixture CLI with `...args`, with `env` over the test's own: its exit code and what it printed. */
export const runCli = Effect.fn('test.runCli')(function* (
  env: Readonly<Record<string, string>>,
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const cwd = yield* appDir;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make('bun', [FIXTURE_CLI, ...args], { cwd, env, extendEnv: true }),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: 3 },
      );
      return { exitCode: Number(exitCode), stdout, out: `${stdout}${stderr}` };
    }),
  );
});
