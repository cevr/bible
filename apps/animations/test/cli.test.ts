// The film CLI as it is run: the flags the README documents parse, and a
// misspelt scene fails naming the scenes the film has instead of checking or
// printing nothing. No browser, no Rive CLI, no paid call.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const film = 'righteousness-by-faith';

const text = (stream: Stream.Stream<Uint8Array, unknown>) =>
  Stream.mkString(Stream.decodeText(stream));

/** `bun cli.ts ...args` in this app: its exit code and everything it printed. */
const cli = Effect.fn('test.cli')(function* (...args: ReadonlyArray<string>) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const path = yield* Path.Path;
  const cwd = path.join(import.meta.dir, '..');
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(ChildProcess.make('bun', ['cli.ts', ...args], { cwd }));
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: 3 },
      );
      return { exitCode: Number(exitCode), out: `${stdout}${stderr}` };
    }),
  );
});

const unknownTypo = (out: string) => {
  expect(out).toContain('UnknownScene');
  expect(out).toContain('no scene "typo"');
  // The message lists what the film does have.
  expect(out).toContain('cold');
  expect(out).toContain('robe');
};

describe('film cli', () => {
  it.effect.layer(BunServices.layer)('check --scene id,id parses and reads the project', () =>
    Effect.gen(function* () {
      const run = yield* cli('check', film, '--allow-stale', '--scene', 'title,cold');
      expect(run.out).not.toContain('Unrecognized flag');
      // The project reads, and only the scenes asked for are probed: no
      // finding names another scene, however many are drawn yet.
      expect(run.exitCode).toBe(0);
      const named = [...run.out.matchAll(/scene "([^"]+)"/g)].map((m) => m[1]);
      expect(named.filter((id) => id !== 'title' && id !== 'cold')).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)('check --scene with a misspelt id fails', () =>
    Effect.gen(function* () {
      const run = yield* cli('check', film, '--allow-stale', '--scene', 'cold,typo');
      expect(run.exitCode).not.toBe(0);
      unknownTypo(run.out);
    }),
  );

  it.effect.layer(BunServices.layer)('cues with a misspelt scene fails', () =>
    Effect.gen(function* () {
      const run = yield* cli('cues', film, 'typo');
      expect(run.exitCode).not.toBe(0);
      unknownTypo(run.out);
    }),
  );

  it.effect.layer(BunServices.layer)('cues --sound on a film with no sound.ts says so', () =>
    Effect.gen(function* () {
      const run = yield* cli('cues', film, '--sound');
      expect(run.exitCode).not.toBe(0);
      expect(run.out).toContain('SoundMissing');
    }),
  );
});
