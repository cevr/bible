// A standing figure casts a contact shadow on the ground at its feet (DIRECTION,
// "Contact shadow"): the kit's `person` lays the engine's `ground` under it,
// fading as it sits and gone when the figure names no ground under it (in the
// air, on the cross, lying down). The shadow's one gradient is the tell: the
// person draws nothing else radial.

import { isRadial, recorder, withDom } from '@bible/film/stand-in';
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { type Person, person } from '../src/films/righteousness-by-faith/kit.ts';

const hand = { boil: 0, seed: 3 };

/** The alpha of every contact shadow a person casts: each radial fill, drawn into the stand-in. */
const shadowsOf = (p: Person) =>
  Effect.sync(() =>
    withDom(() => {
      const r = recorder();
      person(r.ctx, p, hand);
      return r.fills.filter((f) => isRadial(f.style)).map((f) => f.alpha);
    }),
  );

describe('person on the ground', () => {
  it.effect('a standing person casts a contact shadow at its feet', () =>
    Effect.gen(function* () {
      expect(yield* shadowsOf({})).toEqual([1]);
    }),
  );

  it.effect('the shadow fades as the person sits, and is gone once seated', () =>
    Effect.gen(function* () {
      const half = yield* shadowsOf({ sit: 0.5 });
      expect(half).toHaveLength(1);
      expect(half[0] ?? -1).toBeCloseTo(0.5);
      expect(yield* shadowsOf({ sit: 1 })).toEqual([]);
    }),
  );

  it.effect('a person with no ground under them casts none; part ground, part shadow', () =>
    Effect.gen(function* () {
      expect(yield* shadowsOf({ ground: 0 })).toEqual([]);
      const part = yield* shadowsOf({ ground: 0.25 });
      expect(part[0] ?? -1).toBeCloseTo(0.25);
    }),
  );
});
