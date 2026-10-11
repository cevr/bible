import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_EASE,
  clamp,
  ease,
  invLerp,
  frameAtOrAfter,
  frameAtOrBefore,
  framesOf,
  heardAtOrAfter,
  justBefore,
  keys,
  lerp,
  offTheMs,
  onTheMs,
  progress,
  staggered,
  timecode,
  timecodeParts,
} from './time.ts';

describe('a word heard at or after a mark', () => {
  test('is on the mark or within a millisecond before it, and not earlier', () => {
    expect(heardAtOrAfter({ start: 2 }, 2)).toBe(true);
    expect(heardAtOrAfter({ start: 1.9995 }, 2)).toBe(true);
    expect(heardAtOrAfter({ start: 1.998 }, 2)).toBe(false);
    expect(heardAtOrAfter({ start: 2.5 }, 2)).toBe(true);
  });

  test('the last instant before an end is a millisecond short of it', () => {
    expect(justBefore(10)).toBeCloseTo(9.999, 9);
  });
});

describe('the time grid', () => {
  test('a time written to #t= or as an in point reads back in its own frame, never before it', () => {
    // A scene that starts off the millisecond grid: `]` seeks to its exact start.
    for (const T of [12.3333333, 4.5, 0, 7.12999, 99.0001]) {
      const read = onTheMs(T);
      expect(read).toBeGreaterThanOrEqual(T);
      expect(read - T).toBeLessThan(0.001);
    }
    // A time already on the grid is written as itself, so reloads never creep.
    expect(onTheMs(12.33)).toBe(12.33);
  });

  test('an out point rounds down, so a span marked never reaches past the times marked', () => {
    for (const T of [12.3333333, 4.5, 0, 7.12999, 99.0001]) {
      const read = offTheMs(T);
      expect(read).toBeLessThanOrEqual(T);
      expect(T - read).toBeLessThan(0.001);
    }
    expect(offTheMs(12.33)).toBe(12.33);
    expect([onTheMs(3.4562), offTheMs(3.4562)]).toEqual([3.457, 3.456]);
  });

  test('a time on a frame is that frame, either way; float noise around it is not the next', () => {
    // 0.1 + 0.2 is a hair over 0.3: still frame 9 at 30 fps, both ways.
    expect([frameAtOrAfter(0.1 + 0.2, 30), frameAtOrBefore(0.1 + 0.2, 30)]).toEqual([9, 9]);
    expect([frameAtOrAfter(0.31, 30), frameAtOrBefore(0.31, 30)]).toEqual([10, 9]);
    // A boil tick at 12 a second: 0.25 s is the third tick's start.
    expect(frameAtOrBefore(0.25 - 1e-12, 12)).toBe(3);
  });

  test('the frames a span holds: the first at or after its start, the last before its end', () => {
    expect(framesOf({ from: 1, to: 2 }, 30)).toEqual({ first: 30, last: 59 });
    expect(framesOf({ from: 3.4562, to: 7.4562 }, 30)).toEqual({ first: 104, last: 223 });
  });
});

describe('time', () => {
  test('a time reads as the timecode of its nearest frame: HH:MM:SS:FF', () => {
    expect(timecode(0)).toBe('00:00:00:00');
    expect(timecode(65.4)).toBe('00:01:05:12');
    expect(timecode(525.9)).toBe('00:08:45:27');
    expect(timecode(3600 + 1 / 30)).toBe('01:00:00:01');
    // Between frames, the nearest: a video's clock a hair short of 4 s says 4 s; at 24 fps, frames count to 23.
    expect(timecode(3.99999)).toBe('00:00:04:00');
    expect(timecode(0.4 / 30)).toBe('00:00:00:00');
    expect(timecode(1.97, 24)).toBe('00:00:01:23');
    // Before a scene's start, signed.
    expect(timecode(-0.5)).toBe('−00:00:00:15');
  });

  test('a timecode is right at any rate a video keeps: whole, 1000/1001 counted non-drop-frame, or neither', () => {
    // Whole rates: a second holds that many frames.
    expect(timecode(2, 24)).toBe('00:00:02:00');
    expect(timecode(25 / 24, 24)).toBe('00:00:01:01');
    expect(timecode(10, 30)).toBe('00:00:10:00');
    expect(timecode(62 / 30, 30)).toBe('00:00:02:02');
    // 29.97 (30000/1001) counts 30 frames a second, non-drop-frame (NDF), so it
    // runs behind the wall clock: frame 1000 is 33 s and 10 frames in its count.
    const ntsc = 30000 / 1001;
    expect(timecode(1000 / ntsc, ntsc)).toBe('00:00:33:10');
    expect(timecode(1000, ntsc)).toBe('00:16:39:00');
    // A rate that is neither (12.5, a phone's 29.6): the frame within its wall second.
    expect(timecode(2, 12.5)).toBe('00:00:02:00');
    expect(timecode(10, 12.5)).toBe('00:00:10:00');
    expect(timecode(24 / 12.5, 12.5)).toBe('00:00:01:11');
    expect(timecode(13 / 12.5, 12.5)).toBe('00:00:01:00');
    expect(timecode(12 / 12.5, 12.5)).toBe('00:00:00:12');
    expect(timecode(60, 29.6)).toBe('00:01:00:00');
    // A measured rate a hair over 12.5 (as a real file's timestamps give it):
    // frame 25 starts a hair before 2 s, so it is the last of second 1.
    const measured = 12.50000260416721;
    expect(timecode(25 / measured, measured)).toBe('00:00:01:12');
    expect(timecode(26 / measured, measured)).toBe('00:00:02:00');
  });

  test('a timecode at any rate keeps its frame within its second, and never runs back as time grows', () => {
    const whole = [1, 6, 10, 12, 15, 23, 24, 25, 29, 30, 48, 50, 59, 60, 120];
    const broadcast = [...whole, ...whole.map((fps) => (fps * 1000) / 1001)];
    // Rates no grid counts whole, and each a few parts in ten million off
    // (the noise a measure over a file's timestamps carries).
    const odd = [0.5, 6.25, 7.3, 10, 12.5, 15, 23.5, 24, 25, 29.6, 30, 59.7].flatMap((fps) =>
      [-10, -5, -2, -1, 0, 1, 2, 5, 10].map((k) => fps * (1 + k * 2e-7)),
    );
    const wrong: Array<string> = [];
    for (const fps of [...broadcast, ...odd]) {
      const last = Math.ceil(fps) - 1;
      let before = '';
      // Each frame's start, and two times inside it.
      for (let i = 0; i < 1000 * 3; i++) {
        const p = timecodeParts(i / 3 / fps, fps);
        const ff = Number(p.ff);
        const now = `${p.hh}:${p.mm}:${p.ss}:${p.ff.padStart(4, '0')}`;
        if (!(ff >= 0 && ff <= last) || now < before)
          wrong.push(`${fps} fps, frame ${i / 3}: ${now}`);
        before = now;
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  test("a set's stagger spreads its items' starts over a share of the progress", () => {
    // Three tiles over the first 2/7: the middle one starts at 1/7 and lasts 5/7,
    // what `clamp(p * 1.4 - i * 0.2)` drew by hand.
    for (const p of [0, 0.1, 0.3, 0.55, 0.8, 1])
      for (const i of [0, 1, 2])
        expect(staggered(p, i / 2, 2 / 7)).toBeCloseTo(clamp(p * 1.4 - i * 0.2), 12);
    // A share of 1 starts each item at its place, at once.
    expect([staggered(0.49, 0.5, 1), staggered(0.5, 0.5, 1)]).toEqual([0, 1]);
  });

  test('eases are exactly 0 before their start and 1 after', () => {
    for (const e of Object.values(ease)) {
      expect(progress(0, 1, 1, e)).toBe(0);
      expect(progress(3, 1, 1, e)).toBe(1);
    }
  });

  // Golden values: every committed frame reads these curves, so a refactor
  // that moves one in the last bit fails here before it moves a pixel.
  test('each ease is pinned to the bit at a quarter, a half and three quarters', () => {
    const at = Object.fromEntries(
      Object.entries(ease).map(([name, e]) => [name, [0.25, 0.5, 0.75].map(e)]),
    );
    expect(at).toEqual({
      linear: [0.25, 0.5, 0.75],
      inQuad: [0.0625, 0.25, 0.5625],
      outQuad: [0.4375, 0.75, 0.9375],
      inOutQuad: [0.125, 0.5, 0.875],
      inCubic: [0.015625, 0.125, 0.421875],
      outCubic: [0.578125, 0.875, 0.984375],
      inOutCubic: [0.0625, 0.5, 0.9375],
      outQuart: [0.68359375, 0.9375, 0.99609375],
      inOutQuart: [0.03125, 0.5, 0.96875],
      outExpo: [0.8232233047033631, 0.96875, 0.99447572827198],
      inOutExpo: [0.015625, 0.5, 0.984375],
      inSine: [0.07612046748871326, 0.2928932188134524, 0.6173165676349102],
      inOutSine: [0.1464466094067262, 0.49999999999999994, 0.8535533905932737],
      outBack: [0.8174096875000002, 1.0876975, 1.0641365625],
      outSoft: [0.7260141046107038, 1.019554308130029, 1.0133225025680326],
    });
  });

  test('lerp, clamp, invLerp, progress and keys are pinned', () => {
    expect([lerp(0.1, 0.7, 0.3), lerp(1.3, -2.2, 0.35), clamp(1.2), invLerp(2, 4, 3)]).toEqual([
      0.28, 0.07500000000000018, 1, 0.5,
    ]);
    expect(progress(1.5, 1, 1)).toBe(0.5);
    expect(
      [0.1, 0.3, 0.5].map((t) =>
        keys(t, [
          [0, 1],
          [0.2, 2],
          [0.6, 0, 'outCubic'],
        ]),
      ),
    ).toEqual([1.5, 0.84375, 0.03125]);
  });

  test('a key that names no ease takes the fallback, the default ease unless given', () => {
    const frames = [
      [0, 0],
      [1, 1],
    ] as const;
    expect(keys(0.25, frames)).toBe(ease[DEFAULT_EASE](0.25));
    expect(keys(0.25, frames, 'outCubic')).toBe(ease.outCubic(0.25));
    expect(
      keys(
        0.25,
        [
          [0, 0],
          [1, 1, 'linear'],
        ],
        'outCubic',
      ),
    ).toBe(0.25);
  });
});
