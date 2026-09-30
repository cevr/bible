import { describe, expect, test } from 'bun:test';
import type { Pcm } from './audio.ts';
import { SCORE, aloneSpans, aloneWeights, speechSpans } from './score.ts';

const RATE = 1000;

/** A voice bus that speaks (a loud constant) over each span, silent between. */
const voiceOver = (seconds: number, spans: ReadonlyArray<[number, number]>): Pcm => {
  const frames = seconds * RATE;
  const plane = new Float32Array(frames);
  for (const [from, to] of spans) plane.fill(0.3, from * RATE, to * RATE);
  return { rate: RATE, frames, channels: [plane, plane] };
};

describe('score', () => {
  test('the voice speaks where its windows pass the gate', () => {
    expect(
      speechSpans(
        voiceOver(10, [
          [1, 3],
          [5, 6],
        ]),
      ),
    ).toEqual([
      { from: 1, to: 3 },
      { from: 5, to: 6 },
    ]);
    expect(speechSpans(voiceOver(4, [[2, 4]]))).toEqual([{ from: 2, to: 4 }]);
  });

  test('a pause shorter than the rule stays under; a longer one plays alone inside its ramps', () => {
    const edge = SCORE.lead + SCORE.ramp;
    const spans = aloneSpans(
      [
        { from: 3, to: 4 },
        { from: 5, to: 6 },
        { from: 12, to: 14 },
      ],
      20,
    );
    expect(spans).toEqual([
      // Before the first word: alone from the film's start, down before it speaks.
      { hold: { from: 0, to: 3 - edge }, rise: false, fall: true },
      // 4–5 is a breath: under. 6–12 rests: alone inside its ramps.
      { hold: { from: 6 + edge, to: 12 - edge }, rise: true, fall: true },
      // After the last word: alone to the film's end.
      { hold: { from: 14 + edge, to: 20 }, rise: true, fall: false },
    ]);
  });

  test('a film no one speaks in is the score alone', () => {
    expect(aloneSpans([], 8)).toEqual([{ hold: { from: 0, to: 8 }, rise: false, fall: false }]);
  });

  test('the weight ramps linearly into and out of each hold', () => {
    const weights = aloneWeights(
      [{ hold: { from: 3, to: 5 }, rise: true, fall: true }],
      RATE,
      8 * RATE,
    );
    const at = (secs: number) => weights[Math.round(secs * RATE)] ?? NaN;
    expect(at(1.5)).toBe(0);
    expect(at(2.5)).toBeCloseTo(0.5, 2);
    expect(at(4)).toBe(1);
    expect(at(5.5)).toBeCloseTo(0.5, 2);
    expect(at(6.5)).toBe(0);
  });
});
