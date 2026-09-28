// The player owns `#T`, the one place a reload reads T from. While T moves
// (play, a drag) it is written at most once per period; when T settles (a
// seek, the end of a drag, a pause) it is written at once; and when the lab
// asks for a write, which reloads the page, it is written at once and held
// there, so the reload lands on the frame the write was made at. `pagehide`
// cannot do this: a URL written during it does not reach the reload.

import { describe, expect, test } from 'bun:test';
import type { Timers } from './throttle.ts';
import { tInUrl } from './t-in-url.ts';

const fakeTimers = () => {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; run: () => void }>();
  const timers: Timers = {
    now: () => now,
    set: (run, ms) => {
      const id = next++;
      due.set(id, { at: now + ms, run });
      return id;
    },
    clear: (id) => {
      due.delete(id);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...due].sort((a, b) => a[1].at - b[1].at))
      if (t.at <= now) {
        due.delete(id);
        t.run();
      }
  };
  return { timers, advance };
};

/** A player's T, and every `#T` written, driven on a fake clock. */
const rig = () => {
  const clock = fakeTimers();
  let T = 0;
  const written: Array<number> = [];
  const url = tInUrl(() => written.push(T), 250, clock.timers);
  const at = (t: number) => {
    T = t;
  };
  return { clock, url, at, written };
};

describe('#T in the URL', () => {
  test('a seek right after a moving write lands at once, not a period later', () => {
    const { url, at, written } = rig();
    at(1);
    url.moved();
    at(2);
    url.settled();
    expect(written).toEqual([1, 2]);
  });

  test('a settle with nothing waiting still writes the T shown', () => {
    const { clock, url, at, written } = rig();
    at(1);
    url.moved();
    clock.advance(300);
    at(1.5);
    url.settled();
    expect(written).toEqual([1, 1.5]);
  });

  test('held for a write: written now, and not moved on by play until T is next settled', () => {
    const { clock, url, at, written } = rig();
    at(10);
    url.moved();
    at(10.1);
    url.held();
    for (const t of [10.2, 10.3, 10.4, 10.5]) {
      at(t);
      url.moved();
      clock.advance(200);
    }
    // The reload the write causes reads 10.1: the frame the write was made at.
    expect(written).toEqual([10, 10.1]);
    // A seek (or a pause) lets T move the URL again.
    at(20);
    url.settled();
    at(20.5);
    clock.advance(300);
    url.moved();
    expect(written).toEqual([10, 10.1, 20, 20.5]);
  });
});
