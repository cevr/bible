// The film CLI as it is run: the flags the README documents parse, and a
// misspelt scene fails naming the scenes the film has instead of checking or
// printing nothing. Static legs only: no browser, no server, no paid call.
// Each test spawns the CLI once, so each has one spawn's budget (`cli-run.ts`).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { runCli, spawnBudget } from './cli-run.ts';

const film = 'righteousness-by-faith-v1';

/** `bun cli.ts ...args` in this app: its exit code and everything it printed. */
const cli = (...args: ReadonlyArray<string>) => runCli({}, args);

const unknownTypo = (out: string) => {
  expect(out).toContain('UnknownScene');
  expect(out).toContain('no scene "typo"');
  // The message lists what the film does have.
  expect(out).toContain('1888');
  expect(out).toContain('justified');
};

describe('film cli', () => {
  it.effect.layer(BunServices.layer)(
    'check --scene id,id parses',
    () =>
      Effect.gen(function* () {
        const run = yield* cli(
          'check',
          film,
          '--static',
          '--allow-stale',
          '--scene',
          '1888,justified',
        );
        expect(run.out).not.toContain('Unrecognized flag');
        expect(run.exitCode).toBe(0);
      }),
    spawnBudget(1),
  );

  it.effect.layer(BunServices.layer)(
    'check --scene with a misspelt id fails',
    () =>
      Effect.gen(function* () {
        const run = yield* cli('check', film, '--static', '--allow-stale', '--scene', '1888,typo');
        expect(run.exitCode).not.toBe(0);
        unknownTypo(run.out);
      }),
    spawnBudget(1),
  );

  it.effect.layer(BunServices.layer)(
    'cues with a misspelt scene fails',
    () =>
      Effect.gen(function* () {
        const run = yield* cli('cues', film, 'typo');
        expect(run.exitCode).not.toBe(0);
        unknownTypo(run.out);
      }),
    spawnBudget(1),
  );

  it.effect.layer(BunServices.layer)(
    'cues --sound with a misspelt scene fails',
    () =>
      Effect.gen(function* () {
        const run = yield* cli('cues', film, 'typo', '--sound');
        expect(run.exitCode).not.toBe(0);
        unknownTypo(run.out);
      }),
    spawnBudget(1),
  );
});
