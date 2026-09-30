// A fresh run's answers as the review and the lab read them. `film check
// --json` prints one Schema-encoded CheckLine per line of stdout (logs go to
// stderr): a line that does not decode is the check and its reader
// disagreeing about the format, so it fails the run by name instead of being
// skipped, and a check that fails to run is itself one error finding.

import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Schema } from 'effect';
import { FreshProcessFailed } from '../core/refusals.ts';
import { CheckLineJson, checkLines, failedCheck } from './fresh-film.ts';

const warning = {
  level: 'warning',
  tag: 'AssetMissing',
  message: 'sound "coins" has not been generated; the mix plays without it',
} as const;
const error = {
  level: 'error',
  tag: 'CueLate',
  message: 'scene "hand": cue "topple" ends at 12.40s, after the scene (12.10s)',
  address: { scene: 'hand' },
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
