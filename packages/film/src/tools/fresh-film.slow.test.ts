// A fresh run's answers as the review and the lab read them. `film check
// --json` prints one Schema-encoded CheckLine per line of stdout (logs go to
// stderr): a line that does not decode is the check and its reader
// disagreeing about the format, so it fails the run by name instead of being
// skipped, and a check that fails to run is itself one error finding. A keep
// is asked of `film options keep-voice`, which refuses a take that says
// something else unless it is passed `--accept-mismatch`. A seed heard alone
// is asked of `film options sound`, which writes it where it is told.

import { test } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Schema, Sink, Stream } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { UnknownScene } from '../core/errors.ts';
import { FreshProcessFailed, TakeMismatch, VerbRefused } from '../core/refusals.ts';
import { FilmName } from './film-repo.ts';
import {
  CheckLineJson,
  CuesRead,
  FreshFilm,
  OptionsKept,
  OptionsSounded,
  ScenesRead,
  checkLines,
  failedCheck,
} from './fresh-film.ts';

const warning = {
  level: 'warning',
  tag: 'AssetMissing',
  message: 'sound "coins" has not been generated; the mix plays without it',
} as const;
const error = {
  level: 'error',
  tag: 'CueLate',
  message: 'scene "hand": cue "topple" ends at 12.40s, after the scene (12.10s)',
  address: { part: { _tag: 'Scenes', ids: ['hand'] } },
} as const;

const encode = Schema.encodeSync(CheckLineJson);

/** The timeout of a test here that runs the read in a fresh process: a cold start's time is the machine's. */
const SPAWNS_MS = 30_000;

describe('check lines', () => {
  it.effect('each line is one finding, as the CLI encodes it, its address when it has one', () =>
    Effect.gen(function* () {
      const out = [encode(warning), encode(error), ''].join('\n');
      expect(yield* checkLines('film check --static', out)).toEqual([warning, error]);
    }),
  );

  it.effect('no findings is no lines', () =>
    Effect.gen(function* () {
      expect(yield* checkLines('film check --static', '')).toEqual([]);
    }),
  );

  it.effect('a line that is not a finding fails the run, naming it', () =>
    Effect.gen(function* () {
      const failed = yield* Effect.flip(
        checkLines('film check --static', 'error   CueLate      the old text format'),
      );
      expect(failed._tag).toBe('FreshProcessFailed');
      expect(failed.message).toContain('film check --static failed');
      expect(failed.message).toContain('the old text format');
    }),
  );

  test('a check that could not run is one error finding, in its words', () => {
    const failed = FreshProcessFailed.make({ command: 'film check --sound', reason: 'exit 2' });
    expect(failedCheck(failed)).toEqual([
      { level: 'error', tag: 'FreshProcessFailed', message: 'film check --sound failed: exit 2' },
    ]);
  });
});

const ATTEMPT = 'a.0123456789ab.flac';
const kept = OptionsKept.make({
  take: { hash: 'h', file: ATTEMPT, duration: 1, words: [], source: 'recorded' },
  heard: 'Hello there.',
  wer: 0.5,
  mixed: true,
});
const mismatch = TakeMismatch.make({
  id: 'a',
  script: 'Hello world.',
  heard: 'Hello there.',
  wer: 0.5,
});

/**
 * The film CLI answering each run with the line `answer` gives its
 * arguments, and exit 0 unless `answer` says otherwise. Each run's arguments
 * are pushed to `runs`.
 */
const cliAnswering = (
  runs: Array<ReadonlyArray<string>>,
  answer: (args: ReadonlyArray<string>) => { readonly line: string; readonly exit?: number },
) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      if (command._tag !== 'StandardCommand') return Effect.die('a piped command is not run here');
      const args = command.args;
      runs.push(args);
      const { line, exit = 0 } = answer(args);
      const stdout = Stream.make(new TextEncoder().encode(`${line}\n`));
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(0),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exit)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout,
          stderr: Stream.empty,
          all: stdout,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        }),
      );
    }),
  );

/**
 * The film CLI as `film options keep-voice` answers: the take kept when it is
 * passed `--accept-mismatch`, else refused for saying something else. Each
 * run's arguments are pushed to `runs`. `answer` is the line it answers
 * with when it keeps the take.
 */
const keepVoiceCli = (
  runs: Array<ReadonlyArray<string>>,
  answer = Schema.encodeSync(Schema.fromJsonString(OptionsKept))(kept),
) =>
  cliAnswering(runs, (args) => {
    let line = Schema.encodeSync(Schema.fromJsonString(TakeMismatch))(mismatch);
    if (args.includes('--accept-mismatch')) line = answer;
    return { line };
  });

describe('keep-voice', () => {
  it.effect('asks the CLI to accept a mismatch only when told to, and answers what it says', () => {
    const runs: Array<ReadonlyArray<string>> = [];
    const film = Schema.decodeSync(FilmName)('test');
    return Effect.gen(function* () {
      const fresh = yield* FreshFilm;
      const refused = yield* Effect.flip(
        fresh.keepVoice(film, 'a', ATTEMPT, { acceptMismatch: false }),
      );
      expect(refused._tag).toBe('TakeMismatch');
      expect(yield* fresh.keepVoice(film, 'a', ATTEMPT, { acceptMismatch: true })).toEqual(kept);
      expect(runs).toEqual([
        ['cli.ts', 'options', 'keep-voice', 'test', 'a', ATTEMPT],
        ['cli.ts', 'options', 'keep-voice', 'test', 'a', ATTEMPT, '--accept-mismatch'],
      ]);
    }).pipe(
      Effect.provide(FreshFilm.layer(['bun', 'cli.ts']).pipe(Layer.provide(keepVoiceCli(runs)))),
    );
  });

  it.effect("reads an older film CLI's answer, which says only whether it mixed", () => {
    const film = Schema.decodeSync(FilmName)('test');
    const legacy = keepVoiceCli([], '{"_tag":"OptionsKept","mixed":true}');
    return Effect.gen(function* () {
      const answer = yield* (yield* FreshFilm).keepVoice(film, 'a', ATTEMPT, {
        acceptMismatch: true,
      });
      expect(answer).toEqual(OptionsKept.make({ mixed: true }));
    }).pipe(Effect.provide(FreshFilm.layer(['bun', 'cli.ts']).pipe(Layer.provide(legacy))));
  });
});

describe('sound', () => {
  it.effect(
    'asks the CLI for the seed by its point and label, written where it is told, or its refusal',
    () => {
      const runs: Array<ReadonlyArray<string>> = [];
      const film = Schema.decodeSync(FilmName)('test');
      const refusal = VerbRefused.make({
        point: 'take:coins',
        variant: 'abc',
        verb: 'hear alone',
        reason: 'it is not made from data',
      });
      const cli = cliAnswering(runs, (args) => {
        if (args.includes('abc'))
          return { line: Schema.encodeSync(Schema.fromJsonString(VerbRefused))(refusal), exit: 1 };
        return {
          line: Schema.encodeSync(Schema.fromJsonString(OptionsSounded))(OptionsSounded.make({})),
        };
      });
      return Effect.gen(function* () {
        const fresh = yield* FreshFilm;
        yield* fresh.sound(film, 'take:coins', 'code:v:graph/1', '/cache/a.wav.partial');
        const refused = yield* Effect.flip(fresh.sound(film, 'take:coins', 'abc', '/cache/b'));
        expect(refused).toEqual(refusal);
        expect(runs[0]).toEqual([
          'cli.ts',
          'options',
          'sound',
          'test',
          '--point',
          'take:coins',
          '--variant',
          'code:v:graph/1',
          '--to',
          '/cache/a.wav.partial',
        ]);
      }).pipe(Effect.provide(FreshFilm.layer(['bun', 'cli.ts']).pipe(Layer.provide(cli))));
    },
  );
});

describe("the easel tools' runs", () => {
  it.effect(
    "a check of scenes draws them alone; a cues read answers the CLI's lines, or the film's refusal; a scenes read names them",
    () => {
      const runs: Array<ReadonlyArray<string>> = [];
      const film = Schema.decodeSync(FilmName)('test');
      const cli = cliAnswering(runs, (args) => {
        if (args[1] === 'check') return { line: encode(error), exit: 1 };
        if (args[2] === 'scenes')
          return {
            line: Schema.encodeSync(Schema.fromJsonString(ScenesRead))(
              ScenesRead.make({ scenes: ['hand', 'roof'] }),
            ),
          };
        if (args[4] === 'nope')
          return {
            line: Schema.encodeSync(Schema.fromJsonString(UnknownScene))(
              UnknownScene.make({ scene: 'nope', known: ['hand'] }),
            ),
            exit: 1,
          };
        return {
          line: Schema.encodeSync(Schema.fromJsonString(CuesRead))(
            CuesRead.make({ lines: ['hand start=0.00 dur=12.10'], late: 1 }),
          ),
        };
      });
      return Effect.gen(function* () {
        const fresh = yield* FreshFilm;
        expect(yield* fresh.check('test', 'draw', ['hand', 'roof'])).toEqual([error]);
        expect(yield* fresh.check('test', 'draw')).toEqual([error]);
        expect(yield* fresh.cues(film, Option.some('hand'))).toEqual(
          CuesRead.make({ lines: ['hand start=0.00 dur=12.10'], late: 1 }),
        );
        const refused = yield* Effect.flip(fresh.cues(film, Option.some('nope')));
        expect(refused).toEqual(UnknownScene.make({ scene: 'nope', known: ['hand'] }));
        expect(yield* fresh.scenes(film)).toEqual(['hand', 'roof']);
        expect(runs).toEqual([
          ['cli.ts', 'check', 'test', '--draw', '--scene', 'hand,roof', '--allow-stale', '--json'],
          ['cli.ts', 'check', 'test', '--draw', '--allow-stale', '--json'],
          ['cli.ts', 'read', 'cues', 'test', 'hand'],
          ['cli.ts', 'read', 'cues', 'test', 'nope'],
          ['cli.ts', 'read', 'scenes', 'test'],
        ]);
      }).pipe(Effect.provide(FreshFilm.layer(['bun', 'cli.ts']).pipe(Layer.provide(cli))));
    },
  );
});

// `film read script` run fresh, as the lab runs it, over a synthetic film on
// disk (`fixtures/films/sample`): each beat's line arrives as the script says
// it, marks in braces, since the Script reader and an ask's script mark its
// words by that line and refuse a mark once it says other words.
const SAMPLE = Schema.decodeSync(FilmName)('sample');

describe('film read script, run fresh', () => {
  it.effect.layer(
    FreshFilm.layer([
      'bun',
      `${import.meta.dir}/fixtures/read-cli.ts`,
      `${import.meta.dir}/fixtures/films`,
    ]).pipe(Layer.provideMerge(BunServices.layer)),
  )(
    "answers each beat's line as the script says it, its picture and its sources",
    () =>
      Effect.gen(function* () {
        const beats = yield* (yield* FreshFilm).script(SAMPLE);
        expect(beats).toEqual([
          {
            id: 'open',
            say: 'A question, {ask}and its answer.',
            picture: 'IDEA: a page, and a question on it.',
            cite: ['Job 9:2', 'Romans 4:5'],
          },
          { id: 'title', picture: 'The title.', cite: [] },
        ]);
      }),
    // oxlint-disable-next-line film/tests-keep-their-strength -- FreshFilm reads the film in a fresh process, a spawn inside the service the test provides (spawn budget).
    SPAWNS_MS,
  );
});

// `film read clock` run fresh over the same film: the registered scenes on
// the film's takes (none: every voiced beat is estimated) and its declared
// acts; a version folder with its own scenes (`sample/v3/`), read wholly from
// that folder (its take, drawn scenes, acts and score); and a version folder
// with a script alone (`sample/v2/script.ts`), on the holds it declares.
describe('film read clock, run fresh', () => {
  it.effect.layer(
    FreshFilm.layer([
      'bun',
      `${import.meta.dir}/fixtures/read-cli.ts`,
      `${import.meta.dir}/fixtures/films`,
    ]).pipe(Layer.provideMerge(BunServices.layer)),
  )(
    "answers the registered film's clock, and each version folder's from its own files",
    () =>
      Effect.gen(function* () {
        const fresh = yield* FreshFilm;
        const [film, folder, own] = yield* Effect.all(
          [
            fresh.clock(SAMPLE, Option.none()),
            fresh.clock(SAMPLE, Option.some('v2')),
            fresh.clock(SAMPLE, Option.some('v3')),
          ],
          { concurrency: 3 },
        );
        expect(film.beats.map((b) => [b.id, b.voice, b.drawn])).toEqual([
          ['open', 'estimated', true],
          ['title', 'silent', true],
        ]);
        expect(film.beats[0]?.marks.map((m) => m.name)).toEqual(['ask']);
        expect(film.beats[1]).toMatchObject({ start: film.beats[0]?.dur, dur: 3 });
        expect(film.acts.map((a) => [a.name, a.from, a.start])).toEqual([
          ['open', 'open', 0],
          ['title', 'title', film.beats[0]?.dur ?? -1],
        ]);
        expect(folder.beats.map((b) => [b.id, b.voice, b.drawn])).toEqual([
          ['open', 'estimated', false],
          ['end', 'silent', false],
        ]);
        // Its tail of 2 s in place of the default 0.1 s; its end held 4 s by `min`.
        expect((folder.beats[0]?.dur ?? 0) - (film.beats[0]?.dur ?? 0)).toBeCloseTo(1.9, 6);
        expect(folder.beats[1]?.dur).toBe(4);
        expect([folder.acts, folder.movements]).toEqual([[], []]);
        // v3's own take (staging, its mark on its own words), its own drawn
        // scenes, its own act and its own score's movement.
        expect(own.beats.map((b) => [b.id, b.voice, b.drawn])).toEqual([
          ['seed', 'staging', true],
          ['end', 'silent', false],
        ]);
        expect(own.beats[0]?.marks).toEqual([{ name: 'sown', at: 1.5 }]);
        expect(own.acts.map((a) => [a.name, a.from])).toEqual([['sowing', 'seed']]);
        expect(own.movements.map((m) => [m.name, m.from])).toEqual([['sowing', 'seed']]);
      }),
    // oxlint-disable-next-line film/tests-keep-their-strength -- FreshFilm reads the film in a fresh process, a spawn inside the service the test provides (spawn budget).
    SPAWNS_MS,
  );
});
