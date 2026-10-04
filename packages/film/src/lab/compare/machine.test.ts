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
  blendOf,
  compareAt,
  compareMachine,
  compareView,
  layerOf,
  modeOf,
  splitOf,
} from './machine.ts';

describe('what the panel reads', () => {
  test("the HEAD layer: hidden while off, HEAD in a wipe or on a blink's HEAD, now on its other side", () => {
    expect(layerOf(CompareState.Off({ split: 0.5 }))).toBe('hidden');
    expect(layerOf(CompareState.Wipe({ split: 0.5 }))).toBe('head');
    expect(layerOf(CompareState.Blink({ split: 0.5, head: true }))).toBe('head');
    expect(layerOf(CompareState.Blink({ split: 0.5, head: false }))).toBe('now');
  });

  test("the divider sits at the wipe's split, and only in a wipe", () => {
    expect(splitOf(CompareState.Wipe({ split: 0 }))).toEqual(Option.some(0));
    expect(splitOf(CompareState.Off({ split: 0.5 }))).toEqual(Option.none());
    expect(splitOf(CompareState.Blink({ split: 0.5, head: true }))).toEqual(Option.none());
  });
});

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

describe('diff (PA-9)', () => {
  test('shows HEAD whole over the frame in the difference blend: black where nothing moved', () => {
    const diff = CompareState.Diff({ split: 0.5 });
    expect(layerOf(diff)).toBe('head');
    expect(blendOf(diff)).toBe('difference');
    expect(splitOf(diff)).toEqual(Option.none());
    expect(modeOf(diff)).toBe('diff');
    for (const state of [
      CompareState.Off({ split: 0.5 }),
      CompareState.Wipe({ split: 0.5 }),
      CompareState.Blink({ split: 0.5, head: true }),
    ])
      expect(blendOf(state)).toBe('normal');
  });

  it.effect('is a mode like the others, keeping the divider', () =>
    Effect.gen(function* () {
      const result = yield* simulate(off, [
        CompareEvent.Choose({ mode: 'wipe' }),
        CompareEvent.Split({ split: 0.3 }),
        CompareEvent.Choose({ mode: 'diff' }),
        CompareEvent.Choose({ mode: 'wipe' }),
      ]);
      expect(result.states.slice(2)).toEqual([
        CompareState.Wipe({ split: 0.3 }),
        CompareState.Diff({ split: 0.3 }),
        CompareState.Wipe({ split: 0.3 }),
      ]);
    }),
  );
});

describe('press and hold, the blink by hand (PA-9)', () => {
  it.effect('a hold shows HEAD for as long as it lasts; the release shows now', () =>
    Effect.gen(function* () {
      const result = yield* simulate(off, [
        CompareEvent.Choose({ mode: 'blink' }),
        CompareEvent.Hold({ on: true }),
        CompareEvent.Hold({ on: false }),
      ]);
      expect(result.states.slice(2)).toEqual([
        CompareState.Held({ split: 0.5 }),
        CompareState.Blink({ split: 0.5, head: false }),
      ]);
      expect(layerOf(CompareState.Held({ split: 0.5 }))).toBe('head');
      expect(modeOf(CompareState.Held({ split: 0.5 }))).toBe('blink');
    }),
  );

  it.effect('while held, the timed flip waits', () =>
    Effect.gen(function* () {
      const actor = yield* Machine.spawn(off);
      yield* actor.start;
      yield* actor.send(CompareEvent.Choose({ mode: 'blink' }));
      yield* actor.send(CompareEvent.Hold({ on: true }));
      yield* TestClock.adjust(`${BLINK_MS * 3} millis`);
      expect(yield* SubscriptionRef.get(actor.state)).toEqual(CompareState.Held({ split: 0.5 }));
    }).pipe(Effect.scoped),
  );

  it.effect('a hold means nothing outside the blink', () =>
    Effect.gen(function* () {
      yield* assertPath(off, [CompareEvent.Hold({ on: true })], ['Off']);
    }),
  );
});

describe('the URL and the view (PA-9)', () => {
  test("the mode is the link's (`?view=`); the divider is this viewer's, kept through a reload", () => {
    for (const state of [
      CompareState.Off({ split: 0.2 }),
      CompareState.Wipe({ split: 0.7 }),
      CompareState.Blink({ split: 0.4, head: false }),
      CompareState.Diff({ split: 0.6 }),
    ]) {
      const kept = compareView(state);
      expect(kept).toEqual({ split: state.split });
      const back = compareAt(modeOf(state), kept);
      expect(modeOf(back)).toBe(modeOf(state));
      expect(back.split).toBe(state.split);
    }
    expect(compareAt('blink', { split: 0.4 })).toEqual(
      CompareState.Blink({ split: 0.4, head: true }),
    );
  });
});
