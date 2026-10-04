// A fresh run's answers as the review and the lab read them. `film check
// --json` prints one Schema-encoded CheckLine per line of stdout (logs go to
// stderr): a line that does not decode is the check and its reader
// disagreeing about the format, so it fails the run by name instead of being
// skipped, and a check that fails to run is itself one error finding. A keep
// is asked of `film options keep-voice`, which refuses a take that says
// something else unless it is passed `--accept-mismatch`.

import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Schema, Sink, Stream } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { FreshProcessFailed, TakeMismatch } from '../core/refusals.ts';
import { FilmName } from './film-repo.ts';
import { CheckLineJson, FreshFilm, OptionsKept, checkLines, failedCheck } from './fresh-film.ts';

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
 * The film CLI as `film options keep-voice` answers: the take kept when it is
 * passed `--accept-mismatch`, else refused for saying something else. Each
 * run's arguments are pushed to `runs`. `answer` is the line it answers
 * with when it keeps the take.
 */
const keepVoiceCli = (
  runs: Array<ReadonlyArray<string>>,
  answer = Schema.encodeSync(Schema.fromJsonString(OptionsKept))(kept),
) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      if (command._tag !== 'StandardCommand') return Effect.die('a piped command is not run here');
      const args = command.args;
      runs.push(args);
      let line = Schema.encodeSync(Schema.fromJsonString(TakeMismatch))(mismatch);
      if (args.includes('--accept-mismatch')) line = answer;
      const stdout = Stream.make(new TextEncoder().encode(`${line}\n`));
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(0),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
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
