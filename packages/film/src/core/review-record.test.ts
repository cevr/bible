// A review record's words: which recommendation keeps (lock, keep or go on,
// by its value or its label; more work never does), a crop's file in the
// set, a finding answered once kept when the critique answers it again
// word for word, and one finding answered by its number.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Result, Schema } from 'effect';
import { AskBlock, oneQuestion } from './ask.ts';
import {
  type ReviewFinding,
  type ReviewRecord,
  answered,
  carriedDone,
  cropFile,
  keepRecommended,
} from './review-record.ts';

/** One page whose choice recommends the option `value`, labelled `label`. */
const recommending = (value: string, label: string) =>
  oneQuestion(
    Schema.decodeSync(Schema.Array(AskBlock))([
      {
        kind: 'choose',
        id: 'cast',
        label: 'The cast',
        options: [
          { value, label, recommended: true },
          { value: 'other', label: 'Other' },
        ],
      },
    ]),
  );

const finding = (what: string): ReviewFinding => ({
  scene: 'rain',
  at: 'mark:rain',
  figure: 'farmer',
  aspect: 'head angle',
  what,
});

/** What was done about each finding, `-` for nothing yet. */
const doneOf = (findings: ReadonlyArray<ReviewFinding>) => findings.map((f) => f.done ?? '-');

describe('a review record', () => {
  it.effect('keeps on lock, keep or go, by value or label; never on more work', () =>
    Effect.sync(() => {
      const tags = (pairs: ReadonlyArray<readonly [string, string]>) =>
        pairs.map(([value, label]) => keepRecommended(recommending(value, label))._tag);
      const keeps = tags([
        ['lock', 'Lock both'],
        ['yes', 'Keep him'],
        ['go', 'Go on to the scenes'],
      ]);
      const others = tags([
        ['revise', 'Revise both'],
        ['golden', 'Make it golden'],
        ['locked-out', 'Leave him'],
      ]);
      expect({ keeps, others }).toEqual({
        keeps: ['Some', 'Some', 'Some'],
        others: ['None', 'None', 'None'],
      });
    }),
  );

  it.effect("a crop's file names its scene, its place made plain, its figure and its kind", () =>
    Effect.sync(() => {
      expect(cropFile('rain', 'cue:fall@0.5', 'farmer', 'side')).toBe(
        'review/crops/rain.cue-fall-0.5.farmer.side.png',
      );
    }),
  );

  it.effect('a finding answered before keeps its answer; a new one and a reworded one do not', () =>
    Effect.sync(() => {
      const before = [
        { ...finding('front, the concept three-quarter'), done: 'turned three-quarter' },
      ];
      expect(
        doneOf(
          carriedDone(before, [
            finding('front, the concept three-quarter'),
            finding('front, the concept turned'),
          ]),
        ),
      ).toEqual(['turned three-quarter', '-']);
    }),
  );

  it.effect('answers one finding by its number, and refuses a number it does not hold', () =>
    Effect.sync(() => {
      const record: ReviewRecord = {
        film: 'f',
        made: 't',
        scenes: [],
        crops: [],
        findings: [finding('a'), finding('b')],
        skipped: [],
      };
      const two = Result.getOrThrow(answered(record, 2, 'fixed'));
      expect(doneOf(two.findings)).toEqual(['-', 'fixed']);
      expect(Result.isFailure(answered(record, 3, 'fixed'))).toBe(true);
      expect(Result.isFailure(answered(record, 1, '  '))).toBe(true);
    }),
  );
});
