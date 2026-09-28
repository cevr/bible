// The lab reads `film check --static --json`: one Schema-encoded CheckLine per
// line of stdout (logs go to stderr). A line that does not decode is the check
// and the lab disagreeing about the format, so it fails the run by name
// instead of being skipped.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Schema } from 'effect';
import { CheckLineJson, checkLines } from './static-check.ts';

const warning = {
  level: 'warning',
  tag: 'AssetMissing',
  message: 'sound "coins" has not been generated; the mix plays without it',
} as const;
const error = {
  level: 'error',
  tag: 'CueLate',
  message: 'scene "hand": cue "topple" ends at 12.40s, after the scene (12.10s)',
} as const;

const encode = Schema.encodeSync(CheckLineJson);

describe('static check lines', () => {
  it.effect('each line is one finding, as the CLI encodes it', () =>
    Effect.gen(function* () {
      const out = [encode(warning), encode(error), ''].join('\n');
      expect(yield* checkLines(out)).toEqual([warning, error]);
    }),
  );

  it.effect('no findings is no lines', () =>
    Effect.gen(function* () {
      expect(yield* checkLines('')).toEqual([]);
    }),
  );

  it.effect('a line that is not a finding fails the run, naming it', () =>
    Effect.gen(function* () {
      const failed = yield* Effect.flip(checkLines('error   CueLate      the old text format'));
      expect(failed._tag).toBe('StaticCheckFailed');
      expect(failed.message).toContain('the old text format');
    }),
  );
});
