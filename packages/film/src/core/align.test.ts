import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { CUT_FADE, cutPcm, cutsAround, placeBeats, timeScript, wordError } from './align.ts';
import { normalizeWords } from './narration.ts';
import type { Word } from './schema.ts';

const w = (text: string, start: number, end: number): Word => ({ text, start, end });

describe('normalizeWords and wordError', () => {
  test('punctuation and casing never count as an error', () => {
    expect(normalizeWords('Grace, freely GIVEN.')).toEqual(['grace', 'freely', 'given']);
    expect(wordError(normalizeWords("It's grace."), normalizeWords('its grace'))).toBe(0);
    expect(wordError(['a', 'b', 'c', 'd'], ['a', 'x', 'c'])).toBe(0.5);
  });
});

describe('timeScript', () => {
  test("the script's words take the times of the words heard, keeping the script's text", () => {
    const heard = [w('grace', 0.1, 0.5), w('freely', 0.6, 0.9), w('given', 1, 1.4)];
    expect(timeScript('Grace, freely given.', heard, 1.5)).toEqual([
      w('Grace,', 0.1, 0.5),
      w('freely', 0.6, 0.9),
      w('given.', 1, 1.4),
    ]);
  });

  test('a misheard word keeps its place and the time of what was heard in it', () => {
    const heard = [w('grace', 0.1, 0.5), w('freely', 0.6, 0.9), w('driven', 1, 1.4)];
    expect(timeScript('Grace, freely given.', heard, 1.5).at(2)).toEqual(w('given.', 1, 1.4));
  });

  test('a word nobody heard shares the gap between its neighbours', () => {
    const heard = [w('grace', 0, 0.4), w('given', 1, 1.4)];
    expect(timeScript('Grace freely given', heard, 1.5)).toEqual([
      w('Grace', 0, 0.4),
      w('freely', 0.4, 1),
      w('given', 1, 1.4),
    ]);
  });

  test('a word heard in two pieces spans both; an extra word heard is ignored', () => {
    const heard = [
      w('um', 0, 0.2),
      w('well', 0.3, 0.5),
      w('known', 0.5, 0.8),
      w('truth', 0.9, 1.2),
    ];
    expect(timeScript('Well-known truth.', heard, 1.3)).toEqual([
      w('Well-known', 0.3, 0.8),
      w('truth.', 0.9, 1.2),
    ]);
  });

  test('times stay in order and inside the take', () => {
    const heard = [w('one', 0, 0.5), w('two', 0.4, 0.3), w('three', 0.2, 9)];
    const timed = timeScript('one two three', heard, 2);
    for (const [i, word] of timed.entries()) {
      expect(word.start).toBeLessThanOrEqual(word.end);
      expect(word.end).toBeLessThanOrEqual(2);
      if (i > 0) expect(word.start).toBeGreaterThanOrEqual(timed[i - 1]?.start ?? 0);
    }
  });

  test('nothing heard spreads the words across the take', () => {
    expect(timeScript('a b', [], 2)).toEqual([w('a', 0, 1), w('b', 1, 2)]);
  });
});

describe('placeBeats', () => {
  const beats = [
    { id: 'one', text: 'In the beginning was the Word.' },
    { id: 'two', text: 'And the Word was with God.' },
    { id: 'three', text: 'And the Word was God.' },
  ];
  /** `said` heard from `at`, a word every 0.3 s, each 0.2 s long. */
  const read = (said: string, at: number) =>
    said.split(' ').map((t, i) => w(t, at + i * 0.3, at + 0.2 + i * 0.3));
  const one = read('in the beginning was the word', 0.5);
  const two = read('and the word was with god', 4);
  const three = read('and the word was god', 7.5);

  test('each beat spans its own words in one reading, with the silence either side of it', () => {
    const placed = placeBeats(beats, [...one, ...two, ...three], 10);
    expect(Result.getOrThrow(placed)).toEqual([
      { id: 'one', start: 0.5, end: 0.7 + 5 * 0.3, before: 0, after: 4 },
      { id: 'two', start: 4, end: 4.2 + 5 * 0.3, before: 0.7 + 5 * 0.3, after: 7.5 },
      { id: 'three', start: 7.5, end: 7.7 + 4 * 0.3, before: 4.2 + 5 * 0.3, after: 10 },
    ]);
  });

  test('a beat the reading skipped fails naming that beat, first, middle or last', () => {
    for (const [heard, skipped] of [
      [[...two, ...three], 'one'],
      [[...one, ...three], 'two'],
      [[...one, ...two], 'three'],
    ] as const) {
      const placed = placeBeats(beats, heard, 10);
      expect(Result.isFailure(placed) && placed.failure).toMatchObject({
        _tag: 'BeatUnplaced',
        beat: skipped,
      });
    }
  });

  test('a line flubbed and read again belongs to the reading that finished it, not the beat before', () => {
    // "In the beginning was the Word. And the Word was— And the Word was with God. …"
    const flub = read('and the word was', 3);
    const again = read('and the word was with god', 5);
    const placed = Result.getOrThrow(
      placeBeats(beats, [...one, ...flub, ...again, ...read('and the word was god', 8.5)], 11),
    );
    const flubEnd = 3.2 + 3 * 0.3;
    expect(placed[0]).toEqual({ id: 'one', start: 0.5, end: 0.7 + 5 * 0.3, before: 0, after: 3 });
    expect(placed[1]).toEqual({
      id: 'two',
      start: 5,
      end: 5.2 + 5 * 0.3,
      before: flubEnd,
      after: 8.5,
    });
  });
});

describe('cutting one reading into beats', () => {
  const rate = 1000;
  /** Room tone at `level`, with speech (0.5) over `speech` and a quieter hush (0.001) over `hush`. */
  const recording = (
    seconds: number,
    speech: ReadonlyArray<[number, number]>,
    hush: ReadonlyArray<[number, number]>,
  ) => {
    const plane = Float32Array.from({ length: seconds * rate }, (_, i) => {
      const t = i / rate;
      const inside = (spans: ReadonlyArray<[number, number]>) =>
        spans.some(([a, b]) => t >= a && t < b);
      if (inside(speech)) return 0.5 * Math.sin(i);
      if (inside(hush)) return 0.001 * Math.sin(i);
      return 0.02 * Math.sin(i);
    });
    return { rate, frames: plane.length, channels: [plane] };
  };

  test('the cut between two beats goes at the quietest point of their silence, not its middle', () => {
    const pcm = recording(
      10,
      [
        [0.5, 2],
        [4, 5.7],
      ],
      [[3.5, 3.6]],
    );
    const cuts = cutsAround(
      [
        { id: 'one', start: 0.5, end: 2, before: 0, after: 4 },
        { id: 'two', start: 4, end: 5.7, before: 2, after: 10 },
      ],
      pcm,
    );
    expect(cuts.map((c) => c.id)).toEqual(['one', 'two']);
    // The middle of the silence is 3 s; its quietest point is the hush at 3.5–3.6 s.
    expect(cuts[0]?.to).toBeGreaterThanOrEqual(3.5);
    expect(cuts[0]?.to).toBeLessThan(3.6);
    expect(cuts[1]?.from).toBe(cuts[0]?.to ?? -1);
  });

  test('a flub between two beats is cut out of both', () => {
    const cuts = cutsAround(
      [
        { id: 'one', start: 0.5, end: 2, before: 0, after: 3 },
        { id: 'two', start: 5, end: 6.7, before: 4.1, after: 10 },
      ],
      recording(
        10,
        [
          [0.5, 2],
          [3, 4.1],
          [5, 6.7],
        ],
        [],
      ),
    );
    expect(cuts[0]?.to).toBeLessThanOrEqual(3);
    expect(cuts[1]?.from).toBeGreaterThanOrEqual(4.1);
  });

  test('a beat cut from a reading fades in and out over a few milliseconds, sample-accurate', () => {
    const pcm = recording(3, [[0, 3]], []);
    const cut = cutPcm(pcm, { id: 'one', from: 1, to: 2 });
    const plane = cut.channels[0] ?? new Float32Array();
    expect(cut.frames).toBe(1000);
    expect(plane[0]).toBe(0);
    expect(plane[cut.frames - 1]).toBe(0);
    const fade = Math.round(CUT_FADE * rate);
    // Past the fade the samples are the reading's own.
    expect(plane[fade + 10]).toBe(pcm.channels[0]?.[1000 + fade + 10]);
    expect(Math.abs(plane[Math.floor(fade / 2)] ?? 1)).toBeLessThan(0.5);
  });
});
