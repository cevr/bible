// The compare machine, with no DOM: off, wipe (HEAD left of a divider the
// pointer drags, clamped to the frame) or blink (HEAD and now flip every
// 450 ms, starting on HEAD). The divider keeps its place across modes, and
// the view keeps mode and place through a reload.

import { Effect, Option, SubscriptionRef } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { Machine, assertPath, simulate } from 'effect-machine';
import { TestClock } from 'effect/testing';
import {
  BLINK_MS,
  CompareEvent,
  CompareState,
  compareFromView,
  compareMachine,
  compareView,
} from './machine.ts';

const off = compareMachine(CompareState.Off({ split: 0.5 }));

describe('the modes', () => {
  it.effect('off, wipe and blink, each keeping where the divider sits', () =>
    Effect.gen(function* () {
      const result = yield* simulate(off, [
        CompareEvent.Choose({ mode: 'wipe' }),
        CompareEvent.Split({ split: 0.3 }),
        CompareEvent.Choose({ mode: 'blink' }),
        CompareEvent.Choose({ mode: 'off' }),
        CompareEvent.Choose({ mode: 'wipe' }),
      ]);
      expect(result.states).toEqual([
        CompareState.Off({ split: 0.5 }),
        CompareState.Wipe({ split: 0.5 }),
        CompareState.Wipe({ split: 0.3 }),
        CompareState.Blink({ split: 0.3, head: true }),
        CompareState.Off({ split: 0.3 }),
        CompareState.Wipe({ split: 0.3 }),
      ]);
    }),
  );

  it.effect('the divider stays inside the frame', () =>
    Effect.gen(function* () {
      const result = yield* simulate(off, [
        CompareEvent.Choose({ mode: 'wipe' }),
        CompareEvent.Split({ split: -0.4 }),
      ]);
      expect(result.finalState).toEqual(CompareState.Wipe({ split: 0 }));
      const past = yield* simulate(off, [
        CompareEvent.Choose({ mode: 'wipe' }),
        CompareEvent.Split({ split: 1.7 }),
      ]);
      expect(past.finalState).toEqual(CompareState.Wipe({ split: 1 }));
    }),
  );

  it.effect('the divider moves only in a wipe', () =>
    Effect.gen(function* () {
      yield* assertPath(off, [CompareEvent.Split({ split: 0.2 })], ['Off']);
    }),
  );

  it.effect('a blink flips between HEAD and now', () =>
    Effect.gen(function* () {
      const result = yield* simulate(off, [
        CompareEvent.Choose({ mode: 'blink' }),
        CompareEvent.Flip,
        CompareEvent.Flip,
      ]);
      expect(result.states.slice(1)).toEqual([
        CompareState.Blink({ split: 0.5, head: true }),
        CompareState.Blink({ split: 0.5, head: false }),
        CompareState.Blink({ split: 0.5, head: true }),
      ]);
    }),
  );
});

describe('the blink, through an actor', () => {
  it.effect(`flips on its own every ${BLINK_MS} ms, and stops once off`, () =>
    Effect.gen(function* () {
      const actor = yield* Machine.spawn(off);
      yield* actor.start;
      yield* actor.send(CompareEvent.Choose({ mode: 'blink' }));
      const heads = [];
      for (const _ of [1, 2, 3]) {
        yield* TestClock.adjust(`${BLINK_MS} millis`);
        const state = yield* SubscriptionRef.get(actor.state);
        heads.push(state._tag === 'Blink' && state.head);
      }
      expect(heads).toEqual([false, true, false]);
      yield* actor.send(CompareEvent.Choose({ mode: 'off' }));
      yield* TestClock.adjust(`${BLINK_MS * 3} millis`);
      expect(yield* SubscriptionRef.get(actor.state)).toEqual(CompareState.Off({ split: 0.5 }));
    }).pipe(Effect.scoped),
  );
});

describe('the view', () => {
  test('keeps the mode and the divider through a reload', () => {
    for (const state of [
      CompareState.Off({ split: 0.2 }),
      CompareState.Wipe({ split: 0.7 }),
      CompareState.Blink({ split: 0.4, head: false }),
    ]) {
      const kept = compareView(state);
      expect(compareFromView(kept)._tag).toBe(state._tag);
      expect(compareFromView(kept).split).toBe(state.split);
    }
    expect(compareView(CompareState.Blink({ split: 0.4, head: false }))).toEqual({
      mode: 'blink',
      split: 0.4,
    });
    expect(Option.some(compareFromView({ mode: 'blink', split: 0.4 }))).toEqual(
      Option.some(CompareState.Blink({ split: 0.4, head: true })),
    );
  });
});
