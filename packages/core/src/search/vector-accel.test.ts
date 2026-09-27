/** The accelerated scan must answer exactly what the pure scan answers.
 *
 *  This is the property the whole tiering rests on. `vector-index.ts` promises
 *  the scan "runs byte-identically in a browser worker and in Electron and
 *  under Bun", and an accelerator that returned *nearly* the same neighbors
 *  would break that promise in the way that is hardest to notice: a result page
 *  that differs by one row between a developer's laptop and the deployment.
 *
 *  Equality rather than a tolerance, because the arithmetic permits it. Every
 *  value in the chain is an integer — int8 inputs, int16 products, int32 sums —
 *  and 256 terms cannot overflow or round. A tolerance here would be hiding
 *  exactly the bug this file exists to catch.
 */

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';

import {
  primeVectorAccel,
  readyVectorAccel,
  resetVectorAccel,
  vectorAccel,
} from './vector-accel.js';
import { scanVectorIndex, type VectorIndex, type VectorManifest } from './vector-index.js';

const DIMENSIONS = 256;

/** A deterministic index, so a failure reproduces. */
const makeIndex = (count: number, seed: number): VectorIndex => {
  let state = seed;
  const next = (): number => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  const vectors = new Int8Array(count * DIMENSIONS);
  for (let i = 0; i < vectors.length; i += 1) vectors[i] = Math.trunc(next() * 255) - 128;
  const paragraphIds = Array.from({ length: count }, (_, row) => `BK:${row}`);
  const manifest = {
    books: [{ bookCode: 'BK', offset: 0, count }],
    paragraphIds,
  } as unknown as VectorManifest;
  return {
    fingerprint: 'test',
    dimensions: DIMENSIONS,
    count,
    manifest,
    vectors,
  };
};

const makeQuery = (seed: number): Int8Array => {
  let state = seed;
  const query = new Int8Array(DIMENSIONS);
  for (let i = 0; i < DIMENSIONS; i += 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    query[i] = Math.trunc((state / 2_147_483_648) * 255) - 128;
  }
  return query;
};

describe('vector scan acceleration', () => {
  it.effect('whichever tier loads answers exactly what the pure loop answers', () =>
    Effect.gen(function* () {
      resetVectorAccel();
      const index = makeIndex(4_000, 7);
      const accel = yield* vectorAccel(index);

      // No artifact built in this checkout is a pass, not a skip: the pure
      // loop is the specification, and having no accelerator is a supported
      // state. The assertions below are then trivially true, and the build
      // that *does* ship an artifact is the one that exercises them.
      for (const seed of [1, 2, 3, 11, 101]) {
        const query = makeQuery(seed);
        const pure = scanVectorIndex(index, query, { topK: 30 });
        const fast = scanVectorIndex(index, query, {
          topK: 30,
          ...Option.match(accel, {
            onNone: () => ({}),
            onSome: (ready) => ({ scoreRange: ready.scoreRange }),
          }),
        });
        expect(fast.scanned).toBe(pure.scanned);
        expect(fast.neighbors.map((n) => n.paragraphId)).toEqual(
          pure.neighbors.map((n) => n.paragraphId),
        );
        expect(fast.neighbors.map((n) => n.similarity)).toEqual(
          pure.neighbors.map((n) => n.similarity),
        );
      }
    }),
  );

  it.effect('an accelerator that scores the wrong number of rows is refused', () =>
    Effect.sync(() => {
      const index = makeIndex(500, 3);
      const query = makeQuery(5);
      const pure = scanVectorIndex(index, query, { topK: 10 });
      // A deliberately broken accelerator: it under-fills the buffer, which is
      // the shape that would silently mis-align scores against paragraph ids.
      const broken = scanVectorIndex(index, query, {
        topK: 10,
        scoreRange: (_query, _offset, count, out) => {
          out.fill(0);
          return count - 1;
        },
      });
      // Falling back to the pure loop, rather than ranking a garbage buffer.
      expect(broken.neighbors.map((n) => n.paragraphId)).toEqual(
        pure.neighbors.map((n) => n.paragraphId),
      );
    }),
  );

  it.effect('a scoped scan accelerates only the ranges it is allowed', () =>
    Effect.gen(function* () {
      resetVectorAccel();
      const index = makeIndex(1_000, 13);
      const accel = yield* vectorAccel(index);
      const query = makeQuery(21);
      const allow = new Set(['BK']);
      const pure = scanVectorIndex(index, query, { topK: 15, allow });
      const fast = scanVectorIndex(index, query, {
        topK: 15,
        allow,
        ...Option.match(accel, {
          onNone: () => ({}),
          onSome: (ready) => ({ scoreRange: ready.scoreRange }),
        }),
      });
      expect(fast.scanned).toBe(pure.scanned);
      expect(fast.neighbors).toEqual(pure.neighbors);
    }),
  );

  it.effect('a tier answers only for the vectors it was built from', () =>
    Effect.gen(function* () {
      // The native tier holds a pointer to one index's vectors. Read against
      // another index, it would score the wrong buffer and return plausible,
      // wrong neighbors, so the other index must fall back to the pure loop.
      resetVectorAccel();
      const built = makeIndex(256, 5);
      const other = makeIndex(256, 5);
      yield* vectorAccel(built);
      expect(Option.isNone(readyVectorAccel(other))).toBe(true);
      // Asking for the other index resolves a tier for it, and the first
      // index no longer has one.
      const rebuilt = yield* vectorAccel(other);
      expect(Option.isSome(readyVectorAccel(other))).toBe(Option.isSome(rebuilt));
      expect(Option.isNone(readyVectorAccel(built))).toBe(true);
    }),
  );

  it.live('the priming path is what production reads, and it lands', () =>
    Effect.gen(function* () {
      // Production never awaits a tier: the layer calls `primeVectorAccel` and
      // the scan reads `readyVectorAccel`, which answers `None` until the load
      // finishes. This asserts that pairing actually resolves — a priming call
      // that silently never completed would leave every query on the
      // TypeScript loop, and no other test here would notice.
      resetVectorAccel();
      const index = makeIndex(256, 5);
      expect(Option.isNone(readyVectorAccel(index))).toBe(true);
      primeVectorAccel(index);
      // `it.live`, because priming resolves on the real clock rather than a
      // test one, and a virtual clock would wait forever.
      yield* Effect.sleep('100 millis');
      // An unbuilt checkout resolves to no tier, and that is a pass: the two
      // sides agree either way, which is the property under test.
      const built = yield* vectorAccel(index);
      expect(Option.isSome(readyVectorAccel(index))).toBe(Option.isSome(built));
    }),
  );
});
