// When a word is heard, measured from its take: the aligner's start holds the
// pause before the word, so the voice's own onset and offset are read from
// the audio inside the word's span, through a −40 dBFS gate over 10 ms windows.

import { describe, expect, test } from 'bun:test';
import type { Pcm } from './audio.ts';
import { heard, unmeasured, voicedSpan, voicedWords } from './voiced.ts';

const RATE = 8000;

/** `seconds` of take, a 0.3-amplitude tone where `loud` says and silence elsewhere. */
const take = (seconds: number, loud: ReadonlyArray<readonly [number, number]>): Pcm => {
  const frames = Math.round(seconds * RATE);
  const plane = new Float32Array(frames);
  for (const [from, to] of loud)
    for (let i = Math.round(from * RATE); i < Math.round(to * RATE); i++)
      plane[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE);
  return { rate: RATE, frames, channels: [plane, plane] };
};

describe('voicedSpan', () => {
  test('the pause the aligner put inside a word is not its voice', () => {
    // "Justified?" aligned 0–2.3 s, heard from 0.87 s to 1.9 s.
    const pcm = take(2.5, [[0.87, 1.9]]);
    expect(voicedSpan(pcm, 0, 2.3)).toEqual({ start: 0.87, end: 1.9 });
  });

  test('the voice is read inside the span only: a neighbour heard outside it does not count', () => {
    const pcm = take(2, [
      [0.1, 0.5],
      [1.2, 1.6],
    ]);
    expect(voicedSpan(pcm, 0.5, 1.4)).toEqual({ start: 1.2, end: 1.4 });
  });

  test('a word no window of which passes the gate is heard over its whole span', () => {
    expect(voicedSpan(take(1, []), 0.2, 0.6)).toEqual({ start: 0.2, end: 0.6 });
  });

  test('a voice under −40 dBFS is silence', () => {
    // A 0.008 hum is −42 dBFS: under the gate.
    const quiet: Pcm = {
      rate: RATE,
      frames: RATE,
      channels: [
        Float32Array.from({ length: RATE }, (_, i) => 0.008 + Number(i > RATE / 2) * 0.292),
      ],
    };
    expect(voicedSpan(quiet, 0, 1).start).toBe(0.5);
  });
});

describe('voicedWords and heard', () => {
  test("each word keeps its aligned span and carries its voice's; heard times it by the voice", () => {
    const pcm = take(2, [
      [0.4, 0.8],
      [1.3, 1.7],
    ]);
    const words = voicedWords(
      [
        { text: 'Paul', start: 0, end: 0.8 },
        { text: 'says', start: 0.8, end: 1.8 },
      ],
      pcm,
    );
    expect(words).toEqual([
      { text: 'Paul', start: 0, end: 0.8, voiced: { start: 0.4, end: 0.8 } },
      { text: 'says', start: 0.8, end: 1.8, voiced: { start: 1.3, end: 1.7 } },
    ]);
    expect(heard(words)).toEqual([
      { text: 'Paul', start: 0.4, end: 0.8 },
      { text: 'says', start: 1.3, end: 1.7 },
    ]);
  });

  test('an estimate has no audio: its voice is its span', () => {
    expect(unmeasured([{ text: 'Amen.', start: 0.5, end: 0.9 }])).toEqual([
      { text: 'Amen.', start: 0.5, end: 0.9, voiced: { start: 0.5, end: 0.9 } },
    ]);
  });
});
