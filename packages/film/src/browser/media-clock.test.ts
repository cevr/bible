// One clock every pane of a compare reads, so two versions are never apart:
// it stands while paused, runs at its rate from where it was, and a seek or
// a rate change starts it again from there. It reads monotonic time, so the
// wall clock set right (a sync, a time zone) never moves a playing compare.

import { describe, expect, test } from 'bun:test';
import { type Clock, Effect } from 'effect';
import { makeClock, monotonicNow } from './media-clock.ts';

/** An Effect clock whose wall time and monotonic time are moved apart by hand, in seconds. */
const twoClocks = () => {
  let wall = 1_700_000_000;
  let mono = 50;
  const nanos = (s: number) => BigInt(Math.round(s * 1e9));
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => wall * 1000,
    currentTimeMillis: Effect.sync(() => wall * 1000),
    currentTimeNanosUnsafe: () => nanos(wall),
    currentTimeNanos: Effect.sync(() => nanos(wall)),
    monotonicTimeNanosUnsafe: () => nanos(mono),
    monotonicTimeNanos: Effect.sync(() => nanos(mono)),
    sleep: () => Effect.void,
  };
  return {
    clock,
    pass: (s: number) => {
      wall += s;
      mono += s;
    },
    setWall: (s: number) => (wall += s),
  };
};

/** A clock over a hand-moved `now`, in seconds. */
const handClock = () => {
  let now = 100;
  const clock = makeClock(() => now);
  return { clock, wait: (s: number) => (now += s) };
};

describe('the compare clock', () => {
  test('stands while paused, and runs from where it stood once playing', () => {
    const { clock, wait } = handClock();
    wait(3);
    expect(clock.time()).toBe(0);
    clock.play();
    wait(1.5);
    expect(clock.time()).toBe(1.5);
    clock.pause();
    wait(10);
    expect(clock.time()).toBe(1.5);
    expect(clock.playing()).toBe(false);
  });

  test('a seek moves it, playing or not; a play while playing changes nothing', () => {
    const { clock, wait } = handClock();
    clock.seek(7);
    expect(clock.time()).toBe(7);
    clock.play();
    wait(1);
    clock.play();
    wait(1);
    expect(clock.time()).toBe(9);
    clock.seek(2);
    wait(0.5);
    expect(clock.time()).toBe(2.5);
  });

  test('runs at its rate from the moment the rate changes', () => {
    const { clock, wait } = handClock();
    clock.play();
    wait(2);
    clock.rate(2);
    wait(1);
    expect(clock.time()).toBe(4);
    clock.rate(0.5);
    wait(2);
    expect(clock.time()).toBe(5);
  });

  test("reads the page's monotonic time: the wall clock set 30 s on moves a playing compare not at all", () => {
    const { clock: effectClock, pass, setWall } = twoClocks();
    const clock = makeClock(monotonicNow(effectClock));
    clock.play();
    pass(1);
    expect(clock.time()).toBeCloseTo(1, 9);
    setWall(30);
    expect(clock.time()).toBeCloseTo(1, 9);
    pass(0.5);
    expect(clock.time()).toBeCloseTo(1.5, 9);
  });
});
