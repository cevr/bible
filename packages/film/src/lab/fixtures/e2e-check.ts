// `bun run test:e2e:check [--base <log>] [--log <log>]`: the film e2e, read
// for what the change under test caused. It takes the host's e2e lock
// (`flock` where there is one, else `lockf -k`, on /tmp/bible-tools-e2e.lock)
// for the whole run, so two workspaces on one machine queue rather than time
// each other out. It runs the suite (`test:e2e`), printing as it goes and
// keeping its output in `<log>` (by default `tmp/e2e/<time>.log` at the repo
// root); reads the failed cases (`e2e-verdict.ts`); leaves out those the base
// log names (a log of the same suite on the change's base, local or CI's
// `gh run view --log-failed`); reruns each new one alone, three times, its
// output kept in `<log>.alone.log`; and writes `<log>.verdict.md`, each
// failure classed unit-caused, load-only or base. It exits 1 when a failure
// is unit-caused (or the suite failed and named no case), else 0.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import {
  Array as Arr,
  Clock,
  Config,
  Console,
  DateTime,
  Effect,
  FileSystem,
  Match,
  Option,
  Path,
  Schema,
  Stdio,
  Stream,
} from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import {
  type Judged,
  aloneArgs,
  failuresIn,
  newAgainst,
  verdictMarkdown,
  verdictOf,
} from './e2e-verdict.ts';

/** The host's e2e lock, the one the workspaces' docs name. */
const LOCK = '/tmp/bible-tools-e2e.lock';

/** Set on the run that holds the lock. */
const HELD = 'FILM_E2E_CHECK_LOCKED';

/** How many times a new failure is rerun alone. */
const ALONE = 3;

/** The package's scripts, for the suite's own command. */
const Scripts = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.Struct({ 'test:e2e': Schema.String }) }),
);

/** A flag the check does not take. */
class FlagRefused extends Schema.TaggedError<FlagRefused>()('FlagRefused', {
  message: Schema.String,
}) {}

/** The flags, as `--base <log>` and `--log <log>`; anything else is refused. */
const flagsOf = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const flags = { base: Option.none<string>(), log: Option.none<string>() };
    for (const [flag, ...value] of Arr.chunksOf(args, 2)) {
      const key = Match.value(flag).pipe(
        Match.when('--base', () => Option.some('base' as const)),
        Match.when('--log', () => Option.some('log' as const)),
        Match.orElse(() => Option.none()),
      );
      const given = Option.all([key, Arr.head(value)]);
      if (Option.isNone(given))
        return yield* FlagRefused.make({
          message: `test:e2e:check: unknown or valueless flag ${flag}: use --base <log> and --log <log>`,
        });
      const [name, path] = given.value;
      flags[name] = Option.some(path);
    }
    return flags;
  });

/** Run `command` with `args`; answer its exit code. */
const exitOf = (
  command: string,
  args: ReadonlyArray<string>,
  options: ChildProcess.CommandOptions,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      return yield* (yield* spawner.spawn(ChildProcess.make(command, args, options))).exitCode;
    }),
  );

/** Run this check again under the host's lock, `flock` if the machine has it, else `lockf -k`. */
const underLock = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const flock = (yield* exitOf('sh', ['-c', 'command -v flock'], { stdout: 'ignore' })) === 0;
    // `lockf -k` keeps the lock file, as `flock` does.
    const locker = Match.value(flock).pipe(
      Match.when(true, () => ['flock', LOCK] as const),
      Match.orElse(() => ['lockf', '-k', LOCK] as const),
    );
    const [command, ...lockArgs] = locker;
    return yield* exitOf(command, [...lockArgs, process.execPath, import.meta.path, ...args], {
      env: { [HELD]: '1' },
      extendEnv: true,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });
  });

const check = (flags: Effect.Success<ReturnType<typeof flagsOf>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner;
    const stdio = yield* Stdio.Stdio;
    // src/lab/fixtures → the package, and the repo root.
    const pkg = path.resolve(import.meta.dir, '..', '..', '..');
    const root = path.resolve(pkg, '..', '..');
    const suite = (yield* Effect.flatMap(
      fs.readFileString(path.join(pkg, 'package.json')),
      Schema.decodeUnknownEffect(Scripts),
    )).scripts['test:e2e'];
    const stamp = DateTime.formatIso(yield* DateTime.now).replace(/[:.]/g, '-');
    const log = path.resolve(
      Option.getOrElse(flags.log, () => path.join(root, 'tmp', 'e2e', `${stamp}.log`)),
    );
    yield* fs.makeDirectory(path.dirname(log), { recursive: true });
    const base = yield* Option.match(flags.base, {
      onNone: () => Effect.succeedNone,
      onSome: (b) => Effect.map(fs.readFileString(b), (text) => Option.some(failuresIn(text))),
    });

    // The suite, as `test:e2e` runs it, its output printed and kept.
    const started = yield* Clock.currentTimeMillis;
    const exit = yield* Effect.scoped(
      Effect.gen(function* () {
        const file = yield* fs.open(log, { flag: 'w' });
        const child = yield* spawner.spawn(
          ChildProcess.make('bun', ['run', 'test:e2e'], { cwd: pkg, stdin: 'inherit' }),
        );
        yield* child.all.pipe(
          Stream.tap((chunk) => file.writeAll(chunk)),
          Stream.run(stdio.stdout({ endOnDone: false })),
        );
        return yield* child.exitCode;
      }),
    );
    const seconds = Math.round(((yield* Clock.currentTimeMillis) - started) / 1000);
    const failed = failuresIn(yield* fs.readFileString(log));
    const fresh = Option.match(base, {
      onNone: () => failed,
      onSome: (b) => newAgainst(failed, b),
    });

    // Each new failure, alone, three times.
    const aloneLog = `${log}.alone.log`;
    yield* fs.writeFileString(aloneLog, '');
    const judged: ReadonlyArray<Judged> = yield* Effect.forEach(failed, (failure) =>
      Effect.gen(function* () {
        if (!fresh.includes(failure)) return { failure, alone: [], verdict: 'base' as const };
        const [command = 'bun', ...rest] = aloneArgs(suite, failure);
        const alone = yield* Effect.forEach(Arr.range(1, ALONE), (k) =>
          Effect.scoped(
            Effect.gen(function* () {
              yield* Console.log(`test:e2e:check: alone ${k}/${ALONE}: ${failure.name}`);
              const child = yield* spawner.spawn(ChildProcess.make(command, rest, { cwd: pkg }));
              const out = yield* child.all.pipe(Stream.decodeText(), Stream.mkString);
              yield* fs.writeFileString(
                aloneLog,
                `\n=== ${failure.name} (alone ${k}/${ALONE})\n${out}`,
                { flag: 'a' },
              );
              return (yield* child.exitCode) === 0;
            }),
          ),
        );
        return { failure, alone, verdict: verdictOf(alone) };
      }),
    );

    const verdictPath = `${log}.verdict.md`;
    // A suite that failed and named no case (it never ran, or died before a case ended) blocks too.
    const unnamed = exit !== 0 && failed.length === 0;
    yield* fs.writeFileString(
      verdictPath,
      [
        verdictMarkdown({ log, base: flags.base, exit, seconds, judged }),
        ...Option.toArray(
          Option.liftPredicate(
            `The suite exited ${exit} and named no failed case: see the log.\n`,
            () => unnamed,
          ),
        ),
      ].join('\n'),
    );
    const caused = judged.filter((j) => j.verdict === 'unit-caused').length;
    yield* Console.log(`test:e2e:check: ${caused} unit-caused; verdict ${verdictPath}`);
    return Number(caused > 0 || unnamed);
  });

const main = Effect.gen(function* () {
  const args = yield* (yield* Stdio.Stdio).args;
  // A refused flag is said before the lock is waited for.
  const flags = yield* flagsOf(args);
  return yield* Option.match(yield* Config.option(Config.String(HELD)), {
    onNone: () => underLock(args),
    onSome: () => check(flags),
  });
}).pipe(
  Effect.catchTag('FlagRefused', (e) => Effect.as(Console.error(e.message), 2)),
  Effect.flatMap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.provide(BunServices.layer),
);

BunRuntime.runMain(main);
