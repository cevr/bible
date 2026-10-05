// `throttled`, which `#t=` is written through while T moves: at most once per
// period, the last request always lands (trailing), and a flush lands a
// waiting write at once.

import { describe, expect, test } from 'bun:test';
import { fakeTimers } from './fixtures/timers.ts';
import { throttled } from './throttle.ts';

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

  test('flush lands a pending write at once, and nothing after it', () => {
    const clock = fakeTimers();
    const writes: Array<string> = [];
    let T = 'a';
    const write = throttled(() => writes.push(T), 250, clock.timers);
    write.request();
    T = 'b';
    write.request();
    expect(writes).toEqual(['a']);
    write.flush();
    expect(writes).toEqual(['a', 'b']);
    clock.advance(1000);
    expect(writes).toEqual(['a', 'b']);
  });

  test('flush with nothing pending writes nothing', () => {
    const clock = fakeTimers();
    const writes: Array<number> = [];
    const write = throttled(() => writes.push(1), 250, clock.timers);
    write.flush();
    expect(writes).toEqual([]);
  });
});
