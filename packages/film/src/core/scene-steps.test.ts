// A scene's rows and their states, pure: a row per cue of a draw's timeline,
// held to the scene's end; each waits before its start, is live up to its
// end with its share played, is held after it and released once it is
// taken back; the next to start is the one that waits the least.

import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import type { ResolvedCue } from './schema.ts';
import { type StepRow, StepState, nextStep, stepRowsOf, stepStateAt } from './scene-steps.ts';

const cue = (start: number, dur: number): ResolvedCue => ({
  start,
  dur,
  end: start + dur,
  ease: 'inOutCubic',
  stagger: 0,
});

const cues = new Map([
  ['rise', cue(1, 2)],
  ['blink', cue(2, 0)],
  ['fall', cue(1, 1)],
]);

describe("a draw's rows", () => {
  test('a row per cue, in the timeline order, held to the scene end; a cue of no length plays one frame', () => {
    expect(stepRowsOf({ cues, dur: 6 }, 25)).toEqual([
      { index: 0, cue: 'rise', words: 'rise', start: 1, end: 3, gone: 6 },
      { index: 1, cue: 'blink', words: 'blink', start: 2, end: 2.04, gone: 6 },
      { index: 2, cue: 'fall', words: 'fall', start: 1, end: 2, gone: 6 },
    ]);
  });
});

describe("a row's state", () => {
  const row: StepRow = {
    index: 0,
    cue: 'rise',
    words: 'drops his head',
    start: 1,
    end: 3,
    gone: 5,
  };

  const stateAt = (r: StepRow, t: number) => stepStateAt([r], t)[0];

  test('waits before its start, live to its end by the share of its span played, held, then released', () => {
    expect(stateAt(row, 0.25)).toEqual(StepState.Waits({ in: 0.75 }));
    expect(stateAt(row, 1)).toEqual(StepState.Live({ progress: 0 }));
    // The share of the time played, not the cue's eased value.
    expect(stateAt(row, 2.5)).toEqual(StepState.Live({ progress: 0.75 }));
    expect(stateAt(row, 3)).toEqual(StepState.Held());
    expect(stateAt(row, 5)).toEqual(StepState.Released());
  });

  test('a cue row is live from its start up to its end and not at it; a cue of no length on its frame only', () => {
    const tags = (t: number) =>
      stepStateAt(
        stepRowsOf(
          {
            cues: new Map([
              ['rise', cue(1, 1)],
              ['beat', cue(2, 0)],
            ]),
            dur: 6,
          },
          30,
        ),
        t,
      ).map((s) => s._tag);
    expect(tags(0.5)).toEqual(['Waits', 'Waits']);
    expect(tags(1)).toEqual(['Live', 'Waits']);
    expect(tags(1.999)).toEqual(['Live', 'Waits']);
    expect(tags(2)).toEqual(['Held', 'Live']);
    expect(tags(2 + 1 / 30 - 1e-6)).toEqual(['Held', 'Live']);
    expect(tags(2 + 1 / 30)).toEqual(['Held', 'Held']);
  });

  test("a draw's row is never released inside its scene", () => {
    const rows = stepRowsOf({ cues, dur: 6 }, 25);
    expect(stepStateAt(rows, 5.99).map((s) => s._tag)).toEqual(['Held', 'Held', 'Held']);
  });
});

describe('the next row to start', () => {
  const rows = stepRowsOf({ cues, dur: 6 }, 25);

  test('the one that waits the least; of two that start together, the first in the scene', () => {
    expect(Option.map(nextStep(rows, 0.5), (n) => [n.row.cue, n.in])).toEqual(
      Option.some(['rise', 0.5]),
    );
    expect(Option.map(nextStep(rows, 1), (n) => n.row.cue)).toEqual(Option.some('blink'));
  });

  test('none once every row has begun', () => {
    expect(nextStep(rows, 2)).toEqual(Option.none());
  });
});
