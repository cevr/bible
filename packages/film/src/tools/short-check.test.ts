// What `film check --short` holds a short to: text inside the safe zone, a
// hook in the first moments, a clean loop and a length that holds. Pure over
// the short, its phrases and what its probed frames report.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from '../core/layout.ts';
import { hashText } from '../core/narration.ts';
import { shortPhrases } from '../core/phrases.ts';
import type { Phrase } from '../core/phrases.ts';
import type { Probed, TextBox } from '../core/schema.ts';
import { type ResolvedShort, resolveShort } from '../core/shorts.ts';
import {
  loopGap,
  loopPicture,
  lumaDiff,
  mergeUnsafe,
  openFrames,
  shortLength,
  shortLevel,
  hookWord,
  stillOpen,
  titleOpen,
  unsafeTexts,
} from './short-check.ts';

const resolved = (duration: number): ResolvedShort => ({
  id: 'probe',
  title: 'Probe',
  spans: [{ scene: 'a', from: 0, to: duration, at: 0 }],
  duration,
  fps: 30,
});

const phrase = (start: number, end: number, text = 'one two'): Phrase => ({
  start,
  end: end + 0.6,
  words: text.split(' ').map((t, i, all) => ({
    text: t,
    start: start + ((end - start) * i) / all.length,
    end: start + ((end - start) * (i + 1)) / all.length,
    quoted: false,
  })),
});

/** A line of text at page px `[x, y]`, `w` × `h`, as the probe reports it. */
const box = (text: string, x: number, y: number, w: number, h: number): TextBox => ({
  text,
  scene: 'a',
  x,
  y,
  w,
  h,
  corners: [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ],
  alpha: 1,
  order: 0,
  scale: 1,
});

/** The short's own line (its hook or a caption), as the page tags it. */
const own = (t: TextBox): TextBox => ({ ...t, caption: true });

const frame = (...texts: ReadonlyArray<TextBox>): Probed => ({ texts, inks: [] });

describe('shortLength', () => {
  test('45 to 75 s holds', () => {
    expect(Option.isNone(shortLength(resolved(60)))).toBe(true);
  });

  test('under 45 s or over 75 s is a warning, over 90 s an error', () => {
    const short = Option.getOrThrow(shortLength(resolved(32)));
    expect(short.message).toContain('outside the 45–75s');
    expect(shortLevel(short)).toBe('warning');
    const long = Option.getOrThrow(shortLength(resolved(95)));
    expect(long.message).toContain('over the 90s');
    expect(shortLevel(long)).toBe('error');
    expect(shortLevel(Option.getOrThrow(shortLength(resolved(80))))).toBe('warning');
  });
});

describe('hookWord', () => {
  test('a first word by 0.3 s hooks', () => {
    expect(Option.isNone(hookWord(resolved(60), [phrase(0.2, 1)]))).toBe(true);
  });

  test('a first word after 0.3 s, or none, is late', () => {
    const late = Option.getOrThrow(hookWord(resolved(60), [phrase(0.8, 2)]));
    expect(late.reason).toBe('late word');
    expect(late.at).toBeCloseTo(0.8);
    expect(shortLevel(late)).toBe('error');
    expect(Option.getOrThrow(hookWord(resolved(60), [])).reason).toBe('late word');
  });
});

describe('the hook and the loop read when words are heard', () => {
  // "The evidence is overwhelming.": the aligner starts "The" at 0 with the
  // 0.4 s pause before it, and ends "overwhelming." 0.5 s after its voice.
  const say = 'The evidence is overwhelming.';
  const aligned: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 0.6, 0.4, 0.6],
    [0.6, 1.1, 0.6, 1.1],
    [1.1, 1.3, 1.1, 1.3],
    [1.3, 2.5, 1.3, 2.0],
  ];
  const words = say.split(' ').map((text, i) => {
    const [start, end, on, off] = aligned[i] ?? [0, 0, 0, 0];
    return { text, start, end, voiced: { start: on, end: off } };
  });
  const take = {
    hash: hashText(say),
    file: 'a.mp3',
    duration: 2.5,
    words,
    source: 'elevenlabs' as const,
  };
  const film = layout([{ id: 'a', say, lead: 0, draw: () => {} }], {
    voice: 'v',
    scenes: { a: take },
  });
  const short = Result.getOrThrow(
    resolveShort(
      film,
      {
        id: 'cut',
        title: 'Cut',
        // From the scene's start, which is no word: a span opening on the voice would hide the late word.
        spans: [{ scene: 'a', from: { scene: 'start' }, to: { scene: 'speechEnd' } }],
      },
      30,
    ),
  );
  const phrases = shortPhrases(film, short);

  test('the first word is late when its voice is, whatever its aligned start', () => {
    const late = Option.getOrThrow(hookWord(short, phrases));
    expect(late.at).toBeCloseTo(0.4);
  });

  test("the loop's silence runs from the last word's voice to the first's", () => {
    // 0.5 s after "overwhelming." is heard, and 0.4 s before "The": 0.9 s.
    const gap = Option.getOrThrow(loopGap(short, phrases));
    expect(gap.value).toBeCloseTo(0.9);
  });
});

describe('loopGap', () => {
  test('the silence from the last word round to the first is counted across the loop', () => {
    // 0.2 s before the first word, 0.3 s after the last: 0.5 s, inside 0.6 s.
    expect(Option.isNone(loopGap(resolved(10), [phrase(0.2, 5), phrase(5, 9.7)]))).toBe(true);
    const gap = Option.getOrThrow(loopGap(resolved(10), [phrase(0.2, 5), phrase(5, 9)]));
    expect(gap.reason).toBe('gap');
    expect(gap.value).toBeCloseTo(1.2);
    expect(shortLevel(gap)).toBe('warning');
  });
});

describe('lumaDiff and loopPicture', () => {
  test('the mean absolute per-cell luma difference, 0 to 1', () => {
    expect(lumaDiff([0, 255], [0, 255])).toBe(0);
    expect(lumaDiff([0, 0], [255, 0])).toBeCloseTo(0.5);
  });

  test('a last frame far from the first is a loop warning', () => {
    expect(Option.isNone(loopPicture('probe', [10, 10], [12, 11]))).toBe(true);
    const cut = Option.getOrThrow(loopPicture('probe', [0, 0], [255, 0]));
    expect(cut.reason).toBe('picture');
    expect(shortLevel(cut)).toBe('warning');
    // It says what it measured: cell by cell, not two frames' means.
    expect(cut.message).toContain('mean absolute per-cell luma difference on a 64×36 grid');
  });
});

describe('unsafeTexts', () => {
  // Page px at twice 1080 × 1920: k = 2.
  const k = 2;

  test('text inside the zone is safe', () => {
    expect(unsafeTexts('probe', 'default', 1, frame(box('safe', 400, 1400, 800, 100)), k)).toEqual(
      [],
    );
  });

  test('text past an edge names the side it crosses most, in 1080 × 1920 px', () => {
    // Right edge at 1080 - 140 = 940 px, 1880 page px; the box ends at 1980 page px.
    const [found] = unsafeTexts(
      'probe',
      'default',
      2,
      frame(box('Justify', 1700, 1400, 280, 80)),
      k,
    );
    expect(found?.side).toBe('right');
    expect(found?.by).toBeCloseTo(50);
    expect(found?.own).toBe(false);
  });

  test("the short's own text is flagged as its own, and is an error; the film's a warning", () => {
    const [mine] = unsafeTexts(
      'probe',
      'ads',
      3,
      frame(own(box('caption', 400, 2600, 800, 100))),
      k,
    );
    // ads: the bottom 35% (672 px) is covered, so text must end by 1248 px.
    expect(mine?.side).toBe('bottom');
    expect(mine?.own).toBe(true);
    expect(shortLevel(mine!)).toBe('error');
    const [film] = unsafeTexts('probe', 'default', 3, frame(box('label', 10, 1400, 80, 50)), k);
    expect(film?.side).toBe('left');
    expect(shortLevel(film!)).toBe('warning');
  });

  test('text faded out is not seen', () => {
    const faded = { ...box('gone', 1900, 100, 200, 80), alpha: 0 };
    expect(unsafeTexts('probe', 'default', 4, frame(faded), k)).toEqual([]);
  });

  test('one finding per line and side: its first time, its furthest reach', () => {
    const a = unsafeTexts('probe', 'default', 5, frame(box('Justify', 1700, 1400, 240, 80)), k);
    const b = unsafeTexts('probe', 'default', 6, frame(box('Justify', 1700, 1400, 300, 80)), k);
    const merged = mergeUnsafe([...a, ...b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.at).toBe(5);
    expect(merged[0]?.by).toBeCloseTo(60);
  });

  test("the short's own lines past one side are one finding: they share one place, so one fix", () => {
    const lines = ['one two', 'three four', 'five six'].flatMap((text, i) =>
      unsafeTexts('probe', 'ads', i, frame(own(box(text, 400, 2600 + i * 10, 800, 100))), k),
    );
    const merged = mergeUnsafe(lines);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toBe('one two');
    expect(merged[0]?.others).toBe(2);
    expect(merged[0]?.message).toContain('and 2 more of its lines');
  });
});

describe('the open', () => {
  test('the frames probed for motion run from the first to the rule', () => {
    const frames = openFrames(30);
    expect(frames[0]).toBe(0);
    expect(frames.at(-1)).toBe(15);
  });

  test('an open that holds still is a hook error; one that moves is not', () => {
    const still = frame(box('word', 100, 100, 100, 40));
    const moved = frame(box('word', 300, 100, 100, 40));
    expect(Option.getOrThrow(stillOpen('probe', [still, still], 0.5)).reason).toBe('still open');
    expect(Option.isNone(stillOpen('probe', [still, moved], 0.5))).toBe(true);
  });

  test('the captions and the hook do not count as motion', () => {
    const a = frame(box('word', 100, 100, 100, 40), own(box('one two', 100, 2600, 400, 80)));
    const b = frame(box('word', 100, 100, 100, 40), own(box('three four', 100, 2600, 400, 80)));
    expect(Option.isSome(stillOpen('probe', [a, b], 0.5))).toBe(true);
  });

  test("the film's title in the first frame is a title card", () => {
    const card = frame(box('Righteousness by Faith', 400, 1400, 900, 120));
    const found = Option.getOrThrow(titleOpen('probe', card, 'Righteousness by Faith'));
    expect(found.reason).toBe('title card');
    const hook = frame(own(box('Righteousness by Faith', 400, 800, 900, 120)));
    expect(Option.isNone(titleOpen('probe', hook, 'Righteousness by Faith'))).toBe(true);
    expect(
      Option.isNone(
        titleOpen('probe', frame(box('Justify', 0, 0, 10, 10)), 'Righteousness by Faith'),
      ),
    ).toBe(true);
  });
});
