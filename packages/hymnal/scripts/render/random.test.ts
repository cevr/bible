import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { pythonRandom } from './random.js';

/** `n` draws of `randint(a, b)` from one generator. */
const draws = (seed: string, n: number, a: number, b: number) => {
  const { randint } = pythonRandom(seed);
  return Array.from({ length: n }, () => randint(a, b));
};

// Each expected list is CPython 3's own output, read once with
// `python3 -I -c "import random; r = random.Random(seed); print([r.randint(a, b) for _ in range(n)])"`.
describe('pythonRandom', () => {
  it.effect('draws the humanise ±5 the listening pilot drew for a stem seed', () =>
    Effect.sync(() => {
      expect(draws('462-C-piano', 12, -5, 5)).toEqual([-4, -2, -3, -4, 4, -4, -2, 0, 0, 5, 4, 0]);
      expect(draws('001-C-violins-melody', 12, -5, 5)).toEqual([
        5, -5, -1, 5, -1, 3, 4, -1, 1, 1, 0, -4,
      ]);
      expect(draws('663-C-bass', 12, -5, 5)).toEqual([-4, -4, -1, 1, 4, 2, -3, -4, 3, 0, -1, 5]);
    }),
  );

  it.effect('draws as CPython does over a range of a power of two and a wide one', () =>
    Effect.sync(() => {
      const { randint } = pythonRandom('x');
      expect(Array.from({ length: 12 }, () => randint(0, 7))).toEqual([
        5, 7, 1, 6, 7, 7, 6, 2, 6, 7, 0, 5,
      ]);
      expect(Array.from({ length: 4 }, () => randint(1, 1000))).toEqual([520, 918, 912, 54]);
    }),
  );
});
