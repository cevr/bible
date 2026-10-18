// earshot as `sfx fit` runs it (`Earshot.layer`, a recording spawner in place
// of git and the sandbox): refused with its install line when its clone or
// virtualenv is missing, or its clone is off the pin or changed; otherwise
// run as `python -I -B` under a sandbox with no network, reading its clone,
// its virtualenv and the recording's folder and writing only its scratch
// folder, Hugging Face offline, the model it wrote read back.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, FileSystem, Layer, Path, Result, Sink, Stream } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { Earshot } from './earshot.ts';

const EARSHOT_PIN = Earshot.pin;

/** A run of a process: its argv, folder and environment. */
interface Spawned {
  readonly argv: ReadonlyArray<string>;
  readonly cwd: string;
  readonly env: Readonly<Partial<Record<string, string>>>;
}

/** What the fake answers: git's head and status, and the model the driver writes to its last argument. */
interface Answers {
  readonly head: string;
  readonly status: string;
  readonly model: string;
}

const handleOf = (stdout: string, exitCode = 0) =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(0),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout: Stream.make(new TextEncoder().encode(stdout)),
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  });

/** A spawner that keeps each command, answers git from `answers`, and for the sandbox writes the model where the driver would. */
const answering = (answers: Answers, spawned: Array<Spawned>) =>
  Effect.map(FileSystem.FileSystem, (fs) =>
    ChildProcessSpawner.make((command) => {
      if (command._tag !== 'StandardCommand') return Effect.succeed(handleOf(''));
      const argv = [command.command, ...command.args];
      spawned.push({ argv, cwd: command.options.cwd ?? '', env: command.options.env ?? {} });
      if (command.command === 'git' && argv.includes('rev-parse'))
        return Effect.succeed(handleOf(`${answers.head}\n`));
      if (command.command === 'git') return Effect.succeed(handleOf(answers.status));
      const out = argv[argv.length - 1] ?? '';
      return fs
        .writeFileString(out, answers.model)
        .pipe(Effect.as(handleOf('{"kind": "modal"}')), Effect.orDie);
    }),
  );

/** earshot at a fixture home (its clone and virtualenv made unless `bare`), over the fake spawner. */
const fitting = (answers: Answers, options: { readonly bare?: boolean } = {}) => {
  const spawned: Array<Spawned> = [];
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
    if (options.bare !== true) {
      yield* fs.makeDirectory(path.join(home, 'earshot'));
      yield* fs.makeDirectory(path.join(home, 'venv', 'bin'), { recursive: true });
      yield* fs.writeFileString(path.join(home, 'venv', 'bin', 'python'), '');
    }
    const recordings = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
    const source = path.join(recordings, 'knock.flac');
    yield* fs.writeFileString(source, 'flac');
    const spawner = yield* answering(answers, spawned);
    const fitted = yield* Effect.result(
      Effect.flatMap(Earshot, (earshot) => earshot.fit(source)).pipe(
        // oxlint-disable-next-line effect/noInlineProvide -- earshot's home is the fixture home this case made
        Effect.provide(
          Earshot.layer.pipe(
            Layer.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)),
            Layer.provide(
              ConfigProvider.layer(ConfigProvider.fromUnknown({ HOME: home, EARSHOT_HOME: home })),
            ),
          ),
        ),
      ),
    );
    return { fitted, home, source, recordings, spawned };
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));
};

const PINNED: Answers = { head: EARSHOT_PIN, status: '', model: '{"kind":"modal"}' };

describe('earshot, as `sfx fit` runs it', () => {
  it.effect('is refused with its install line when it is not installed', () =>
    Effect.gen(function* () {
      const { fitted, home, spawned } = yield* fitting(PINNED, { bare: true });
      expect(fitted._tag).toBe('Failure');
      if (fitted._tag !== 'Failure') return;
      expect(fitted.failure._tag).toBe('EarshotMissing');
      expect(spawned).toEqual([]);
      if (process.platform !== 'darwin') return;
      expect(fitted.failure.message).toContain(`its clone is not at ${home}/earshot`);
      expect(fitted.failure.message).toContain(
        `git -C ${home}/earshot checkout --detach ${EARSHOT_PIN}`,
      );
      expect(fitted.failure.message).toContain('--only-binary :all:');
    }),
  );

  it.effect('is refused at another commit, or with a change in its clone', () =>
    Effect.gen(function* () {
      const off = yield* fitting({ ...PINNED, head: 'f'.repeat(40) });
      const changed = yield* fitting({ ...PINNED, status: ' M earshot/forge/fit/auto.py\n' });
      for (const { fitted } of [off, changed]) expect(fitted._tag).toBe('Failure');
      if (process.platform !== 'darwin') return;
      const messages = [off, changed].map(({ fitted }) =>
        Result.match(fitted, { onSuccess: () => '', onFailure: (failure) => failure.message }),
      );
      expect(messages[0]).toContain(`not the pin ${EARSHOT_PIN}`);
      expect(messages[1]).toContain('earshot/forge/fit/auto.py');
      // Neither ran the fit: only git read the clone.
      expect(changed.spawned.every(({ argv }) => argv[0] === 'git')).toBe(true);
    }),
  );

  it.effect(
    'runs isolated Python in a sandbox with no network, reading its own and the recording, writing its scratch',
    () =>
      Effect.gen(function* () {
        const { fitted, home, source, recordings, spawned } = yield* fitting(PINNED);
        if (process.platform !== 'darwin') {
          expect(fitted._tag).toBe('Failure');
          return;
        }
        expect(fitted._tag === 'Success' && fitted.success).toBe('{"kind":"modal"}');
        const run = spawned.find(({ argv }) => argv[0] === 'sandbox-exec');
        const argv = run?.argv ?? [];
        const scratch = run?.cwd ?? '';
        expect(argv.slice(3, 7)).toEqual([`${home}/venv/bin/python`, '-I', '-B', '-c']);
        expect(argv.slice(8)).toEqual([`${home}/earshot`, source, `${scratch}/model.json`]);
        const lines = (argv[2] ?? '').split('\n');
        expect(lines).toContain(
          `(allow file-read-data (subpath "${home}/earshot") (subpath "${home}/venv") (subpath "${recordings}") (subpath "${scratch}"))`,
        );
        expect(lines).toContain(`(allow file-write* (subpath "${scratch}"))`);
        expect(lines[lines.length - 1]).toBe('(deny network*)');
        expect(run?.env).toEqual({
          PATH: '/usr/bin:/bin',
          HOME: scratch,
          HF_HUB_OFFLINE: '1',
          TRANSFORMERS_OFFLINE: '1',
          HF_HOME: `${scratch}/hf`,
          NUMBA_CACHE_DIR: `${scratch}/numba`,
          MPLCONFIGDIR: `${scratch}/matplotlib`,
          PYTHONDONTWRITEBYTECODE: '1',
        });
        // The driver fits with no description.
        expect(argv[7]).toContain('clap=False');
      }),
  );
});
