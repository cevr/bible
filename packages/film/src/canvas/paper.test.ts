// Film grain is copied out of a pre-drawn sheet at an offset per tick. The
// offset must show each frame pixel the same tile pixel the shifted repeat
// pattern showed (translated by (137, 71) px a tick), stay inside the sheet's
// extra tile, and depend on the tick alone, so a boiled grain still changes
// every tick and any frame draws alone.

import type { Vec2 } from 'math';
import { describe, expect, test } from 'bun:test';
import { grainShift } from './paper.ts';

const mod = (a: number, n: number) => ((a % n) + n) % n;

describe('grainShift', () => {
  test.each([256, 128, 97, 1])(
    'reads the tile pixel the shifted pattern showed, for a %i px tile',
    (size) => {
      const out: Vec2 = [0, 0];
      for (let boil = 0; boil < 300; boil++) {
        grainShift(out, boil, size);
        expect(out[0]).toBeGreaterThanOrEqual(0);
        expect(out[0]).toBeLessThan(size);
        expect(out[1]).toBeGreaterThanOrEqual(0);
        expect(out[1]).toBeLessThan(size);
        for (let x = 0; x < size * 2 + 3; x += 7) {
          // Pattern translated by (tx, ty): frame pixel x shows tile pixel x - tx.
          expect(mod(x + out[0], size)).toBe(mod(x - boil * 137, size));
          expect(mod(x + out[1], size)).toBe(mod(x - boil * 71, size));
        }
      }
    },
  );

  test('moves the grain on every tick of a boiled cycle, from the tick alone', () => {
    const a: Vec2 = [0, 0];
    const b: Vec2 = [0, 0];
    for (let boil = 0; boil < 64; boil++) {
      grainShift(a, boil, 256);
      grainShift(b, boil + 1, 256);
      expect(a).not.toEqual(b);
      expect(grainShift([9, 9], boil, 256)).toEqual(a);
    }
  });
});
