// A score option's state, the one answer every reader of it shares: composed
// for the plan as the film is timed now, composed for another timing, composed
// but with acts that no longer fit the API (stale, still playable, never a
// failure), or not composed.

import { describe, expect, test } from 'bun:test';
import { layout } from './layout.ts';
import type { Music, SoundManifest, Timings } from './schema.ts';
import { musicKey, musicPlan, scoreOptionState } from './sound.ts';
import { Result } from 'effect';

const noTakes: Timings = { voice: '', scenes: {} };
const draw = () => {};

const music: Music = {
  model: 'music_v2_5',
  styles: ['felt piano'],
  avoid: [],
  acts: [
    { from: 'a', name: 'Open', styles: [] },
    { from: 'b', name: 'Close', styles: [] },
  ],
};
const option = { name: 'piano', music };

/** Scene `a` lasting `secs`, then `b` lasting `last`. */
const timed = (secs: number, last = 6) =>
  layout(
    [
      { id: 'a', min: secs, draw },
      { id: 'b', min: last, draw },
    ],
    noTakes,
  );

const composedFor = (secs: number): SoundManifest => {
  const plan = Result.getOrThrow(musicPlan(music, timed(secs)));
  return { scores: { piano: { hash: musicKey(music, plan), file: 'piano.mp3', sha256: 'ab' } } };
};

describe('scoreOptionState', () => {
  test('current when the manifest holds the option composed for the plan as timed now', () => {
    expect(scoreOptionState(option, timed(5), composedFor(5))._tag).toBe('Current');
  });

  test('stale, re-timed, when it was composed for another timing', () => {
    const state = scoreOptionState(option, timed(7), composedFor(5));
    expect(state).toMatchObject({ _tag: 'Stale', why: { _tag: 'Retimed' } });
  });

  test('stale, not a failure, when an act no longer fits the API', () => {
    // Scene b re-timed to 130 s: act Close runs longer than a chunk may.
    const state = scoreOptionState(option, timed(5, 130), composedFor(5));
    expect(state).toMatchObject({
      _tag: 'Stale',
      asset: { file: 'piano.mp3' },
      why: { _tag: 'ActTooLong', act: 'Close' },
    });
  });

  test('missing when nothing was composed', () => {
    expect(scoreOptionState(option, timed(5), {})).toEqual({ _tag: 'Missing' });
  });
});
