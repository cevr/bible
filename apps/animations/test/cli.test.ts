// The film CLI as it is run, over the fixture film: the flags the README
// documents parse, and a misspelt scene fails naming the scenes the film has
// instead of checking or printing nothing. Static legs only: no browser, no
// server, no paid call. Each test spawns the CLI once, so each has one
// spawn's budget (`cli-run.ts`).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { ProjectRead } from '@bible/film/tools';
import { Effect, FileSystem, Schema } from 'effect';
import { FIXTURE_FILM, runCli, spawnBudget } from './cli-run.ts';

const film = FIXTURE_FILM;

/** The fixture CLI with `...args`: its exit code and everything it printed. */
const cli = (...args: ReadonlyArray<string>) => runCli({}, args);

const unknownTypo = (out: string) => {
  expect(out).toContain('UnknownScene');
  expect(out).toContain('no scene "typo"');
  // The message lists what the film does have.
  expect(out).toContain('turn');
  expect(out).toContain('close');
};

describe('film cli', () => {
  it.effect.layer(BunServices.layer)(
    'check --scene id,id parses',
    () =>
      Effect.gen(function* () {
        const run = yield* cli('check', film, '--static', '--allow-stale', '--scene', 'open,turn');
        expect(run.out).not.toContain('Unrecognized flag');
        expect(run.exitCode).toBe(0);
      }),
    spawnBudget(1),
  );

  it.effect.layer(BunServices.layer)(
    'check --scene with a misspelt id fails',
    () =>
      Effect.gen(function* () {
        const run = yield* cli('check', film, '--static', '--allow-stale', '--scene', 'open,typo');
        expect(run.exitCode).not.toBe(0);
        unknownTypo(run.out);
      }),
    spawnBudget(1),
  );

  it.effect.layer(BunServices.layer)(
    'an unknown film fails with its message, and no stack',
    () =>
      Effect.gen(function* () {
        const run = yield* cli('check', 'nofilm', '--static');
        expect(run.exitCode).not.toBe(0);
        expect(run.out).toContain('FilmNotFound: no film "nofilm"');
        expect(run.out).not.toContain('    at ');
      }),
    spawnBudget(1),
  );

  it.effect.layer(BunServices.layer)(
    'render with an unknown act fails with its message, and no stack, before a browser opens',
    () =>
      Effect.gen(function* () {
        const run = yield* cli('render', film, '--act', 'nope');
        expect(run.exitCode).not.toBe(0);
        expect(run.out).toContain('UnknownAct: the film has no act "nope"');
        expect(run.out).not.toContain('    at ');
        expect(run.out).not.toContain('render.still');
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
    'a failure is reported on stderr, so stdout holds only what the command prints',
    () =>
      Effect.gen(function* () {
        // The lab reads `check --json`'s stdout line by line: a failed check's
        // report there read as a finding that does not decode.
        const run = yield* cli('cues', film, 'typo');
        expect(run.exitCode).not.toBe(0);
        unknownTypo(run.out);
        expect(run.stdout).not.toContain('UnknownScene');
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

  it.effect.layer(BunServices.layer)('narrate --only with a misspelt beat fails', () =>
    Effect.gen(function* () {
      const run = yield* cli('narrate', film, '--only', 'open,typo', '--dry-run');
      expect(run.exitCode).not.toBe(0);
      unknownTypo(run.out);
    }),
  );

  it.effect.layer(BunServices.layer)(
    'cues --sound names the library sound of each placement and each bed',
    () =>
      Effect.gen(function* () {
        const run = yield* cli('cues', film, '--sound');
        expect(run.exitCode).toBe(0);
        expect(run.stdout).toContain('tone.notes');
        expect(run.stdout).toMatch(/^bed .* room\.paper$/m);
      }),
    spawnBudget(1),
  );

  it.effect.layer(BunServices.layer)(
    'sfx list and plan read the library, free',
    () =>
      Effect.gen(function* () {
        const list = yield* cli('sfx', 'list', 'tone');
        expect(list.exitCode).toBe(0);
        expect(list.stdout).toMatch(/^tone\.chime +procedural one-shot derived +3 /m);
        expect(list.stdout).not.toContain('paper.page');
        const plan = yield* cli('sfx', 'plan');
        expect(plan.exitCode).toBe(0);
        // 3 beds × 12 s + 6 × 0.7 s + 6 × 1 s at 40 credits a second (the default candidates by use).
        expect(plan.stdout).toContain('total 15 candidates, 1848 credits');
      }),
    spawnBudget(2),
  );

  it.effect.layer(BunServices.layer)(
    'sfx make spends nothing without --yes, nor over --cap',
    () =>
      Effect.gen(function* () {
        const unconfirmed = yield* cli('sfx', 'make');
        expect(unconfirmed.exitCode).not.toBe(0);
        expect(unconfirmed.out).toContain('PaidUnconfirmed');
        const over = yield* cli('sfx', 'make', '--yes', '--cap', '100');
        expect(over.exitCode).not.toBe(0);
        expect(over.out).toContain('CreditsOverCap');
      }),
    spawnBudget(2),
  );

  it.effect.layer(BunServices.layer)('score composes only the score: --only is gone', () =>
    Effect.gen(function* () {
      const run = yield* cli('score', film, '--only', 'music', '--dry-run');
      expect(run.exitCode).not.toBe(0);
      expect(run.out).toContain('Unrecognized flag: --only');
    }),
  );

  it.effect.layer(BunServices.layer)(
    'a score dry run prints each option, its movements and its cost, and composes nothing',
    () =>
      Effect.gen(function* () {
        const run = yield* cli('score', film, '--dry-run');
        expect(run.exitCode).toBe(0);
        expect(run.out).toContain('option piano  music_v2_5  2 movements');
        expect(run.out).toContain('current  (20920098)');
        expect(run.out).toContain('1 options, ~0 credits to compose (dry run: nothing composed)');
        const lost = yield* cli('score', film, '--option', 'organ', '--dry-run');
        expect(lost.exitCode).not.toBe(0);
        expect(lost.out).toContain('ScoreUnknown');
      }),
    spawnBudget(2),
  );

  it.effect.layer(BunServices.layer)(
    'render flags that would be ignored fail before a browser opens',
    () =>
      Effect.gen(function* () {
        const run = yield* cli(
          'render',
          film,
          '--stills',
          '3',
          '--scene',
          'open',
          '--variant',
          'p1-t5',
        );
        expect(run.exitCode).not.toBe(0);
        expect(run.out).toContain('FlagsConflict');
        expect(run.out).not.toContain('render.still');
      }),
  );

  it.effect.layer(BunServices.layer)(
    'project lists every scene, none rendered yet, and refuses a comment on a scene with no render',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const out = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();
          const listed = yield* runCli({ FILMS_OUT: out }, ['project', film, '--json']);
          expect(listed.exitCode).toBe(0);
          const { project } = yield* Schema.decodeEffect(Schema.fromJsonString(ProjectRead))(
            listed.stdout.trim(),
          );
          expect(project.scenes.map((s) => [s.scene, s.state, s.approval])).toEqual([
            ['open', 'missing', 'none'],
            ['turn', 'missing', 'none'],
            ['close', 'missing', 'none'],
          ]);
          const said = yield* runCli({ FILMS_OUT: out }, [
            'project',
            'comment',
            film,
            'too slow',
            '--scene',
            'turn',
          ]);
          expect(said.exitCode).not.toBe(0);
          expect(said.out).toContain('SceneNotRendered');
          const bad = yield* runCli({ FILMS_OUT: out }, ['render', film, '--variant', 'Not Safe']);
          expect(bad.exitCode).not.toBe(0);
          expect(bad.out).not.toContain('render.encoder');
        }),
      ),
    spawnBudget(3),
  );
});
