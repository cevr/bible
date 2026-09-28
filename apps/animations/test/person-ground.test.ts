// A standing figure casts a contact shadow on the ground at its feet (DIRECTION,
// "Contact shadow"): the kit's `person` lays the engine's `ground` under it,
// fading as it sits and gone when the figure names no ground under it (in the
// air, on the cross, lying down). The shadow's one gradient is the tell: the
// person draws nothing else radial.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Schema } from 'effect';
import { type Person, person } from '../src/films/righteousness-by-faith/kit.ts';

/** Anything a context could answer: callable (answering itself), every property itself, 0 in arithmetic. */
function none(): void {}
const nothing: typeof none = new Proxy(none, {
  get: (_target, key) => {
    if (key === Symbol.toPrimitive) return () => 0;
    if (key === Symbol.iterator) return function* () {};
    return nothing;
  },
  apply: () => nothing,
  construct: () => nothing,
  set: () => true,
});

/**
 * A context that draws nothing and records the alpha each radial gradient
 * was filled at; its state properties hold what is set, through save and restore.
 */
const counting = () => {
  const fills: number[] = [];
  let radial = false;
  const state = new Map<PropertyKey, unknown>([['globalAlpha', 1]]);
  const stack: Map<PropertyKey, unknown>[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'createRadialGradient')
          return () => {
            radial = true;
            return nothing;
          };
        if (key === 'fillRect')
          return () => {
            if (radial) fills.push(Number(state.get('globalAlpha')));
          };
        if (key === 'save') return () => stack.push(new Map(state));
        if (key === 'restore')
          return () => {
            for (const [k, v] of stack.pop() ?? state) state.set(k, v);
          };
        if (key === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        if (state.has(key)) return state.get(key);
        return nothing;
      },
      set: (_target, key, value) => {
        state.set(key, value);
        return true;
      },
    },
  );
  const context: CanvasRenderingContext2D = Schema.decodeSync(Schema.Any)(ctx);
  return { ctx: context, fills };
};

/**
 * The DOM a piece's pastel tiles reach for (`document.createElement('canvas')`,
 * `DOMMatrix` for a pattern's offset), installed for one test and removed after.
 */
const nullDom = Effect.acquireRelease(
  Effect.sync(() => {
    const before = {
      document: Reflect.get(globalThis, 'document'),
      matrix: Reflect.get(globalThis, 'DOMMatrix'),
    };
    Reflect.set(globalThis, 'document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => counting().ctx }),
    });
    Reflect.set(globalThis, 'DOMMatrix', nothing);
    return before;
  }),
  (before) =>
    Effect.sync(() => {
      Reflect.set(globalThis, 'document', before.document);
      Reflect.set(globalThis, 'DOMMatrix', before.matrix);
    }),
);

const hand = { boil: 0, seed: 3 };

/** The alpha of every contact shadow a person casts. */
const shadowsOf = (p: Person) =>
  Effect.scoped(
    Effect.map(nullDom, () => {
      const c = counting();
      person(c.ctx, p, hand);
      return c.fills;
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
