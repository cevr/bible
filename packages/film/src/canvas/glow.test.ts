// A glow and a sky build their gradient once per context and what they hold,
// and lay it by the transform: the frame after builds none. Drawn into the
// stand-in, which records each fill's gradient, its alpha and its transform.

import { describe, expect, test } from 'bun:test';
import { mix } from './colour.ts';
import { recorder } from './fixtures/stand-in.ts';
import { GRADIENTS_KEPT, glow, sky } from './glow.ts';
import { reset } from './scratch.ts';

describe('glow', () => {
  test('a unit gradient from the colour to its own clear, laid over its radius', () => {
    const r = recorder();
    glow(r.ctx, 100, 50, 40, '#fbefc8', 0.5);
    const [fill] = r.fills;
    expect(fill?.rect).toEqual([-1, -1, 2, 2]);
    expect(fill?.m).toEqual([40, 0, 0, 40, 100, 50]);
    expect(fill?.alpha).toBe(0.5);
    expect(fill?.style).toMatchObject({
      _tag: 'Radial',
      circles: [0, 0, 0, 0, 0, 1],
      stops: [
        [0, '#fbefc8'],
        [1, 'rgba(251, 239, 200, 0)'],
      ],
    });
  });

  test('draws nothing at no alpha or no radius, and an alpha past 1 counts as 1', () => {
    const r = recorder();
    glow(r.ctx, 0, 0, 40, '#ffffff', 0);
    glow(r.ctx, 0, 0, 0, '#ffffff', 1);
    expect(r.fills).toEqual([]);
    glow(r.ctx, 0, 0, 40, '#ffffff', 3);
    expect(r.fills[0]?.alpha).toBe(1);
  });

  test('one gradient per context and colour, frame after frame', () => {
    const r = recorder();
    for (let i = 0; i < 5; i++) {
      glow(r.ctx, i, 0, 10 + i, '#e6b347', 1);
      glow(r.ctx, 0, i, 20, '#fbefc8', 1);
    }
    const styles = new Set(r.fills.map((f) => f.style));
    expect(styles.size).toBe(2);
    // Another context builds its own.
    const other = recorder();
    glow(other.ctx, 0, 0, 10, '#e6b347', 1);
    expect(styles.has(other.fills[0]?.style ?? '')).toBe(false);
  });

  test('keeps the last few colours of a glow whose colour moves every frame', () => {
    const r = recorder();
    const at = (i: number) => mix('#000000', '#ffffff', i / 255);
    for (let i = 0; i <= GRADIENTS_KEPT; i++) glow(r.ctx, 0, 0, 10, at(i), 1);
    glow(r.ctx, 0, 0, 10, at(0), 1);
    glow(r.ctx, 0, 0, 10, at(GRADIENTS_KEPT), 1);
    const last = r.fills.length - 1;
    // The first colour was let go and made again; the newest was kept.
    expect(r.fills[last - 1]?.style).not.toBe(r.fills[0]?.style);
    expect(r.fills[last]?.style).toBe(r.fills[GRADIENTS_KEPT]?.style);
  });
});

describe('sky', () => {
  test('one unit gradient per context and stops, however the stops are written', () => {
    const r = recorder();
    sky(r.ctx, 1920, 1080, [
      [0, '#5dccb5'],
      [1, '#e7fab0'],
    ]);
    sky(r.ctx, 1920, 1080, [
      [0, '#5dccb5'],
      [1, '#e7fab0'],
    ]);
    const [a, b] = r.fills;
    expect(a?.style).toBe(b?.style);
    expect(a?.style).toMatchObject({
      _tag: 'Linear',
      line: [0, 0, 0, 1],
      stops: [
        [0, '#5dccb5'],
        [1, '#e7fab0'],
      ],
    });
    // Down the whole frame.
    expect(a?.m).toEqual([1, 0, 0, 1080, 0, 0]);
    expect(a?.rect).toEqual([0, 0, 1920, 1]);
  });
});

describe('mix', () => {
  test('a colour between two, rounded per channel, clamped to the two', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#ab8163', '#f3ebdd', 0)).toBe('#ab8163');
    expect(mix('#ab8163', '#f3ebdd', 2)).toBe('#f3ebdd');
    expect(mix('#fff', '#000', 0.25)).toBe('#bfbfbf');
  });
});

describe('reset', () => {
  test('writes the defaults onto the scratch in place', () => {
    const pose = { a: 3, b: 4, keep: 'x' };
    expect(reset(pose, { a: 0, b: 1 })).toBe(pose);
    expect(pose).toEqual({ a: 0, b: 1, keep: 'x' });
  });
});
