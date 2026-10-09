// `throttled`, which `#t=` is written through while T moves: at most once per
// period, the last request always lands (trailing), and a write made outside
// drops the one waiting.

import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { it } from 'effect-bun-test';
import { TestClock } from 'effect/testing';
import { fakeTimers } from './fixtures/timers.ts';
import { throttled, timersOn } from './throttle.ts';

describe('throttled', () => {
  test('a frame loop writes at most once per period, and the last request lands', () => {
    const clock = fakeTimers();
    const writes: Array<number> = [];
    let T = 0;
    const write = throttled(() => writes.push(T), 250, clock.timers);
    // Sixty frames a second for one second: one write now, then one per 250 ms.
    for (let frame = 0; frame < 60; frame++) {
      T = frame;
      write.request();
      clock.advance(1000 / 60);
    }
    clock.advance(250);
    expect(writes.length).toBeLessThanOrEqual(5);
    expect(writes[0]).toBe(0);
    // The trailing write carries the last frame requested.
    expect(writes.at(-1)).toBe(59);
    expect(clock.pending()).toBe(0);
  });

  test('a write made outside drops the one waiting, and the period starts again from it', () => {
    const clock = fakeTimers();
    const writes: Array<string> = [];
    const write = throttled(() => writes.push('throttled'), 250, clock.timers);
    write.request();
    write.request();
    write.ran();
    clock.advance(1000);
    expect(writes).toEqual(['throttled']);
    expect(clock.pending()).toBe(0);
  });
});

describe('timersOn', () => {
  it.effect(
    'reads the host Clock: its time in ms, a timer when its sleep ends, a cleared one never',
    () =>
      Effect.gen(function* () {
        const timers = timersOn(yield* Effect.context<never>());
        const ran: Array<string> = [];
        const start = timers.now();
        timers.set(() => ran.push('kept'), 100);
        const dropped = timers.set(() => ran.push('dropped'), 100);
        timers.clear(dropped);
        yield* TestClock.adjust('99 millis');
        expect([ran, timers.now() - start]).toEqual([[], 99]);
        yield* TestClock.adjust('1 millis');
        expect([ran, timers.now() - start]).toEqual([['kept'], 100]);
        // A timer that has run is gone: clearing it again is no error.
        timers.clear(dropped);
      }),
  );
});
